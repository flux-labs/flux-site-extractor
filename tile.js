const fs = require('fs')
const gdal = require('gdal')
const f = (n) => Math.floor(n+0.0000001)
const r = Math.round
const c = Math.ceil

const pxToMap = (gt, pos) => {
  return [gt[0] + pos[0] * gt[1] + pos[1] * gt[2], gt[3] + pos[0] * gt[4] + pos[1] * gt[5]]
}

const mapToPx = (gt, pos) => {
  return [(- (gt[0] - pos[0]) / gt[1]), (- (gt[3] - pos[1]) / gt[5])]
}

function makeKey(lat, lon) {
  return (lat < 0 ? 's' : 'n') + 
    (leftPad(Math.abs(c(lat)), 2)) +
    (lon < 0 ? 'w' : 'e') +
    (leftPad(Math.abs(f(lon)), 3));
}

function makeTifKey(lat, lon) {
  return (lat < 0 ? 's' : 'n') + 
    (leftPad(Math.abs(f(lat)), 2)) +
    (lon < 0 ? 'w' : 'e') +
    (leftPad(Math.abs(f(lon)), 3));
}


function hasFile(file) {
  try { if (fs.statSync(file)) return true; } 
  catch(e) { return false; }
}

function leftPad(v, l) {
  var r = v.toString();
  while (r.length < l) { r = '0' + r };
  return r;
};

class Tile {
  
  constructor({latMin, latMax, lonMin, lonMax}) {
    latMin = parseFloat(latMin)
    latMax = parseFloat(latMax)
    lonMin = parseFloat(lonMin)
    lonMax = parseFloat(lonMax)
    this.pad = 1
    this.tiles = []
    this.latMin = latMin
    this.latMax = latMax
    this.lonMin = lonMin
    this.lonMax = lonMax
    this.latDomain = latMax - latMin
    this.lonDomain = lonMax - lonMin
    let rounded = {latMin: f(latMin), latMax: f(latMax), lonMin: f(lonMin), lonMax: f(lonMax)}
    let latDomain = [], lonDomain = []
    if (rounded.latMin === rounded.latMax) {
      latDomain.push({latMin, latMax, latOffset: 0, latDomain: latMax - latMin, min: true, max: true})
    } else {
      latDomain.push({latOffset: 0, latMin: latMin, latMax: rounded.latMax, latDomain: rounded.latMax - latMin, min: true, max: false})
      latDomain.push({latOffset: rounded.latMax - latMin, latMin: rounded.latMax, latMax: latMax, latDomain: latMax - rounded.latMax, min: false, max: true})
    }
    if (rounded.lonMin === rounded.lonMax) {
      lonDomain.push({lonMin, lonMax, lonOffset: 0, lonDomain: lonMax - lonMin, min: true, max: true})
    } else {
      lonDomain.push({lonOffset: 0, lonMin: lonMin, lonMax: rounded.lonMax, lonDomain: rounded.lonMax - lonMin, min: true, max: false})
      lonDomain.push({lonOffset: rounded.lonMax - lonMin, lonMin: rounded.lonMax, lonMax: lonMax, lonDomain: lonMax - rounded.lonMax, min: false, max: true})
    }

    let sizeX, sizeY
    for (var i = 0; i < latDomain.length; i++) {
      for (var j = 0; j < lonDomain.length; j++) {
        let lat = latDomain[i]
        let lon = lonDomain[j]
        var name = makeKey(lat.latMin, lon.lonMin)
        let filename = './tiles/high/' + name + '.img'
        if (!hasFile(filename)) {
          filename = './tiles/low/' + name + '.img'
          if (!hasFile(filename)) {
            filename = './tiles/low/' + makeTifKey(lat.latMin, lon.lonMin) + '.tif'
            if (!hasFile(filename)) {
              this.data = false
              return
            }
          }
        }
        let file = gdal.open(filename)
        if (!sizeX) {
          sizeX = file.rasterSize.x;
          sizeY = file.rasterSize.y;
          this.latSize = f(sizeY * this.latDomain)
          this.lonSize = f(sizeX * this.lonDomain)
          this.ds = gdal.open('temp', 'w', 'MEM', this.lonSize + (this.pad*2), this.latSize + (this.pad*2), 1, gdal.GDT_CFloat32);
          this.band = this.ds.bands.get(1);
        }
        let fileband = file.bands.get(1)
        let gt = file.geoTransform
        let px = {
          min: mapToPx(gt, [lon.lonMin, lat.latMax]),
          max: mapToPx(gt, [lon.lonMax, lat.latMin])
        }
        let xDomain, yDomain
        if (lon.min && lon.max) xDomain = this.lonSize + this.pad*2
        else {
          xDomain = f(px.max[0] - px.min[0])
          if (lon.min) xDomain += this.pad
          if (lon.max) xDomain += this.pad
        }
        if (lat.min && lat.max) yDomain = this.latSize + this.pad*2
        else {
          yDomain = f(px.max[1] - px.min[1])
          if (lat.min) yDomain += this.pad
          if (lat.max) yDomain += this.pad
        }
        let n = Math.abs(xDomain * yDomain)
        let data = new Float32Array(new ArrayBuffer(n*4))
        fileband.pixels.read(f(px.min[0]), f(px.min[1]), xDomain, yDomain, data)
        let lonOffset = lon.lonOffset * sizeX
        if (lon.max && !lon.min) lonOffset += this.pad
        let latOffset = lon.latOffset * sizeY
        if (lat.max && !lat.min) latOffset += this.pad
        this.band.pixels.write(lonOffset, latOffset, xDomain, yDomain, data);
        file.close()
      }
    }
    let lonSize = this.lonSize + (this.pad*2)
    let latSize = this.latSize + (this.pad*2)
    let n = latSize * lonSize
    this.data = new Float32Array(new ArrayBuffer(n*4));
    this.band.pixels.read(0, 0, lonSize, latSize, this.data)
    this.min = this.data.slice(0).sort()[0]
  }

  mesh(xDomain, yDomain) {
    var verts = [], faces = [];
    let sy = (1/this.latSize)+1
    for (var i = 0; i < this.lonSize+2; i++) {
      for (var j = 0; j < this.latSize+2; j++) {
        let ny = sy-(j/(this.latSize));
        let nx = (i/(this.lonSize));
        let z = this.data[j * (this.lonSize+(this.pad*2)) + i] - this.min
        let x = (nx * xDomain) - ((xDomain/this.lonSize)*0.5)
        let y = (ny * yDomain) - ((yDomain/this.latSize)*0.5)
        verts.push([x, y, z]);
      }
    }

    let res = this.latSize+1
    for (var i = 0; i < this.latSize+1; i++) {
      for (var j = 0; j < this.lonSize+1; j++) {
        faces.push([(i + 1) + (res + 1) * j,  (i + 1) + (res + 1) * (j + 1), i + (res + 1) * (j + 1), i + (res + 1) * j ]);
      }
    }
    let mesh = {
      primitive: 'mesh', 
      faces: faces, 
      vertices: verts, 
      units: { vertices: 'meters' }, 
      attributes: { 
        materialProperties: { color: '#ffffff', opacity: 0.6 },
        elevation: this.min,
        latitude: this.latMin,
        longitude: this.lonMin
      }
    }
    return mesh
  }
  
  contours(xDomain, yDomain, interval) {
    interval = parseInt(interval)
    if (isNaN(interval) || !interval || interval < 1) interval = 1
    let dst = gdal.open('temp', 'w', 'Memory');
    let lyr = dst.layers.create('temp', null, gdal.Linestring);
    lyr.fields.add(new gdal.FieldDefn('id', gdal.OFTInteger));
    lyr.fields.add(new gdal.FieldDefn('elev', gdal.OFTReal));
    gdal.contourGenerate({
      src: this.band,
      dst: lyr,
      offset: 0,
      interval: interval,
      idField: 0,
      elevField: 1
    });
    let contours = []
    lyr.features.forEach((feature, i) => {
      let pts = feature.getGeometry().toObject().coordinates.map((pt) => {
        let xPad = xDomain/this.lonSize
        let yPad = yDomain/this.latSize
        return [
          ((pt[0]/(this.lonSize+this.pad*2)) * (xDomain + (xPad*2)))-(xPad), 
          ((pt[1]/(this.latSize+this.pad*2)) * (yDomain + (yPad*2)))-(-yPad)+yDomain, 
          pt[2] - this.min
        ]
      })
      contours.push({primitive: 'polyline', points: pts, units: {points: 'meters'}, attributes: {elevation: feature.fields.get('elev'), latitude: this.latMin, longitude: this.lonMin}})
    })
    return contours
  }

  getSimpleElevation(coords) {
    let x = Math.floor(((coords[1] - this.lonMin) / this.lonDomain)*(this.lonSize))+1
    let y = Math.floor((1-((coords[0] - this.latMin) / this.latDomain))*(this.latSize))+1
    let z = this.data[y * (this.lonSize+(this.pad*2)) + x]
    return z
  }

  getElevation(coords) {
    let mx = this.lonSize+1
    let my = this.latSize+1
    let xp = Math.max(Math.min((((coords[1] - this.lonMin) / this.lonDomain)*(this.lonSize))+1, mx), 1)
    let yp = Math.max(Math.min(((1-((coords[0] - this.latMin) / this.latDomain))*(this.latSize))+1, my), 1)
    // index of 4 tiles
    let x0 = Math.floor(xp - 0.5)
    let x1 = x0 + 1
    let y0 = Math.floor(yp - 0.5)
    let y1 = y0 + 1
    // ratio to those four tiles
    let x1r = (0.5 + (xp - x1))
    let x0r = 1-x1r
    let y1r = (0.5 + (yp - y1))
    let y0r = 1-y1r
    // weighed z value
    let ls = (this.lonSize + (this.pad * 2))
    let x0y0 = this.data[y0 * ls + x0] * ((x0r + y0r)/4)
    let x1y0 = this.data[y0 * ls + x1] * ((x1r + y0r)/4)
    let x0y1 = this.data[y1 * ls + x0] * ((x0r + y1r)/4)
    let x1y1 = this.data[y1 * ls + x1] * ((x1r + y1r)/4)
    // sum of weighed values
    return (x0y0 + x1y0 + x0y1 + x1y1)
  }

  close() {
    this.ds.close()
  }

}

module.exports = Tile
