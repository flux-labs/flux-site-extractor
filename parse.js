'use strict';

let fs = require('fs');
let highways = {motorway: 5, trunk: 4, primary: 3, secondary: 2, tertiary: 1, residential: 1, footway: 0, other: 0, service: 0, path: 0, steps: 0} 
var config = require('./public/config');
let earcut = require('earcut')
let Tile = require('./tile')

// http://stackoverflow.com/questions/639695/how-to-convert-latitude-or-longitude-to-meters
function measure(lat1, lng1, lat2, lng2) {
  var R = 6378.137; // Radius of earth in KM
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
  Math.sin(dLng/2) * Math.sin(dLng/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  var d = R * c;
  return d * 1000; // meters
}

function getOSM(data, options, topo) {
  let features = options.features
  let out = {}, nodes = {};
  for (var k in features) { out[k] = [] };
  var bounds = data.bounds;
  var latDomain = Math.abs(bounds.latMax - bounds.latMin);
  var lngDomain = Math.abs(bounds.lngMax - bounds.lngMin);
  var xDomain = measure(bounds.latMin, bounds.lngMin, bounds.latMin, bounds.lngMax);
  var yDomain = measure(bounds.latMin, bounds.lngMin, bounds.latMax, bounds.lngMin);

  var x0, x1, y0, y1;
  if (bounds.latMin < bounds.latMax) y0 = Math.floor(bounds.latMin), y1 = Math.ceil(bounds.latMax);
  else y0 = Math.floor(bounds.latMax), y1 = Math.ceil(bounds.latMin);
  if (bounds.lngMin < bounds.lngMax) x0 = Math.floor(bounds.lngMin), x1 = Math.ceil(bounds.lngMax);
  else x0 = Math.floor(bounds.lngMax), x1 = Math.ceil(bounds.lngMin);

  //** TOPOGRAPHY
  var latDomain = bounds.latMax - bounds.latMin;
  var lngDomain = bounds.lngMax - bounds.lngMin;
  if (features.topography && topo) out.topography = topo.mesh(xDomain, yDomain)
  if (features.contours && topo) out.contours = topo.contours(xDomain, yDomain, options.contour_interval)

  //** NODES
  let dataNodes = data.osm.node;
  for (let i = 0; i < dataNodes.length; i++) {
    let dataNode = dataNodes[i];
    let id = dataNode.$.id;
    let ny = (dataNode.$.lat - bounds.latMin) / latDomain; 
    let nx = (dataNode.$.lon - bounds.lngMin) / lngDomain;
    nodes[id] = { lat: dataNode.$.lat, lng: dataNode.$.lon, nx: nx, ny: ny, x: nx * xDomain, y: ny * yDomain, tags: {} };
  }
  bounds.x0 = 0
  bounds.x1 = xDomain
  bounds.y0 = 0
  bounds.y1 = yDomain
  function getPolylines(dataWay) {
    let pts = []
    if (dataWay.nd) {
      for (let j = 0, jl = dataWay.nd.length; j < jl; j++) {
        let nid = dataWay.nd[j].$.ref;
        pts.push({x: nodes[nid].x, y: nodes[nid].y, z: 0, lat: parseFloat(nodes[nid].lat), lng: parseFloat(nodes[nid].lng), llat: nodes[nid].lat, llng: nodes[nid].lng})
      }
      return [pts]
      // return trim(pts, bounds)
    } else return []
  }

  function classifyWay(poly, dataWay) {
    let id = dataWay.$.id;
    let way = { primitive: 'polyline', points: [], units: { points: 'meters' } };
    if ((features.topography || features.contours) && topo) {
      for (let j = 0, jl = poly.length; j < jl; j++) {
        let p = poly[j]
        let cLat = p.lat < y0 ? y0 : p.lat > y1 ? y1 : p.lat;
        let cLng = p.lng < x0 ? x0 : p.lng > x1 ? x1 : p.lng;
        let z = Math.max(0, topo.getElevation([cLat, cLng]));
        z -= topo.min;
        if (z == null || isNaN(z)) z = 0
        way.points.push([p.x, p.y, z]);
      }
    } else {
      for (let j = 0, jl = poly.length; j < jl; j++) {
        let p = poly[j]
        way.points.push([p.x, p.y, 0]);
      }
    }
    if (dataWay.tag) {
      for (let j = 0, jl = dataWay.tag.length; j < jl; j++) {
        let tag = dataWay.tag[j].$.k;
        let value = dataWay.tag[j].$.v;
        if (features[tag] || tag === 'natural') {
          way.type = tag;
          switch (tag) {
            case 'highway':
              let sub = dataWay.tag[j].$.v.split('_')[0];
              if (highways[sub] === undefined) return
              way.attributes = { 
                type: value,
                size: highways[value] || 0, 
                materialProperties: { color: '#0000ff', linewidth: 1 },
                latitude: bounds.latMin,
                longitude: bounds.lngMin
              }
              dataWay.tag.map((t) => {
                if (t.$.k === 'name') way.attributes.name = t.$.v
              })
              out.highway.push(way);
              return
            case 'natural':
              if (!value === 'coastline') return
              way.attributes = { 
                materialProperties: { color: '#0000ff', linewidth: 1 },
                latitude: bounds.latMin,
                longitude: bounds.lngMin,
                type: 'coastline'
              }
              out.waterway.push(way);
              return
            case 'waterway':
              way.attributes = { 
                materialProperties: { color: '#0000ff', linewidth: 1 },
                latitude: bounds.latMin,
                longitude: bounds.lngMin,
                type: dataWay.tag[j].$.v
              }
              out[tag].push(way);
              return
            case 'building':
              way.attributes = { 
                materialProperties: { color: '#ff0000', linewidth: 2 },
                latitude: bounds.latMin,
                longitude: bounds.lngMin
              }
              if (value !== 'yes') way.attributes.type = value
              dataWay.tag.map((t) => {
                if (t.$.k === 'height') way.attributes.height = parseFloat(t.$.v)
                if (t.$.k === 'addr:housenumber') way.attributes.number = t.$.v
                if (t.$.k === 'addr:postcode') way.attributes.postcode = t.$.v
                if (t.$.k === 'addr:street') way.attributes.street = t.$.v
                if (t.$.k === 'name') way.attributes.name = t.$.v
              })
              out[tag].push(way);
              return
            case 'leisure':
              if (['dog_park', 'garden', 'firepit', 'golf_course', 'common', 'miniature_golf', 'nature_reserve', 'park', 'pitch', 'playground', 'summer_camp', 'track', 'wildlife_hide'].indexOf(value) === -1) return
              way.attributes = { 
                materialProperties: { color: '#00ff00', linewidth: 1 },
                type: value,
                latitude: bounds.latMin,
                longitude: bounds.lngMin
              }
              dataWay.tag.map((t) => {
                if (t.$.k === 'addr:housenumber') way.attributes.number = t.$.v
                if (t.$.k === 'addr:postcode') way.attributes.postcode = t.$.v
                if (t.$.k === 'addr:street') way.attributes.street = t.$.v
                if (t.$.k === 'name') way.attributes.name = t.$.v
              })
              out[tag].push(way);
              return
            default:
              way.attributes = { 
                materialProperties: { color: '#00ff00', linewidth: 1 },
                latitude: bounds.latMin,
                longitude: bounds.lngMin
              }
              out[tag].push(way);
              return
          }
        }
      }
    }
  }

  //** WAYS
  let dataWays = data.osm.way;
  let ct = 0
  for (let i = 0; i < dataWays.length; i++) {
    let polylines = getPolylines(dataWays[i])
    ct += polylines.length
    polylines.map((p) => {
      if (p.length) classifyWay(p, dataWays[i])
    })
  }

  if (options.features.building_3d) {
    var buildings_3d = []
    var buildings_3d_random = []
    out.building.map((building) => {
      // get lowest point of building profile
      var r = false
      if (!building.attributes.height && !options.features.building_3d_random) return
      var height = building.attributes.height
      if (!height) {
        var min = options.random_min
        var max = options.random_max
        if (min > max) [min, max] = [max, min]
        height = (Math.random() * (max-min)) + min
        r = true
      }
      let zBottom = Infinity
      let flat = []
      building.points.map((point) => { 
        if (point[2] < zBottom) zBottom = point[2] 
        flat.push(point[0], point[1])
      })
      let zTop = zBottom + height
      let l = building.points.length
      let pBottom = building.points.map((point) => [point[0], point[1], zBottom])
      let pTop = building.points.map((point) => [point[0], point[1], zTop])
      let fCap = earcut(flat)
      let faces = []
      for (var i = 0; i < l-1; i++) {
        faces.push([i, i+1, i+l+1, i+l])
      }
      for (var i = 0; i < fCap.length/3; i++) {
        faces.push([fCap[i*3], fCap[i*3+1], fCap[i*3+2]])
        faces.push([fCap[i*3]+l, fCap[i*3+1]+l, fCap[i*3+2]+l])
      }
      let vertices = pBottom.concat(pTop)
      let mesh = {
        primitive: 'mesh',
        vertices: vertices,
        faces: faces,
        units: {vertices: 'meters'}
      }
      if (r) buildings_3d_random.push(mesh)
      else buildings_3d.push(mesh)
    })
    if (buildings_3d.length) out.building_3d = buildings_3d
    if (buildings_3d_random.length) out.building_3d_random = buildings_3d_random
  }
  return out;
}

module.exports = function(data, options, cb) {
  var bounds = data.bounds;
  var topo = (options.features.topography || options.features.contours) ? new Tile({resolution: true, latMin: bounds.latMin, latMax: bounds.latMax, lonMin: bounds.lngMin, lonMax: bounds.lngMax}) : false
  if (!topo.data) topo = false
  var osm = getOSM(data, options, topo);
  if (osm) return cb(false, osm);
  else return cb('error with osm');
}
