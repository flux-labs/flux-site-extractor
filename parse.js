'use strict';

let fs = require('fs');
let highways = {motorway: 5, trunk: 4, primary: 3, secondary: 2, tertiary: 1, other: 0} 
let SyncTileSet = require('node-hgt').SyncTileSet;
var config = require('./public/config');

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

function leftPad(v, l) {
  var r = v.toString();
  while (r.length < l) { r = '0' + r };
  return r;
};

function makeKey(lat, lng) {
  return (lat < 0 ? 'S' : 'N') + 
    (leftPad(Math.abs(Math.floor(lat)), 2)) +
    (lng < 0 ? 'W' : 'E') +
    (leftPad(Math.abs(Math.floor(lng)), 3));
}

function hasFile(name) {
  try { if (fs.statSync('./data/' + name + '.hgt')) return true; } 
  catch(e) { return false; }
}

function getOSM(data, features, topo) {
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
  if (features.topography) {
    var verts = [], faces = [];
    var elevations = [];
    var coords = [];
    var res = 100;
    for (var i = 0; i <= res; i++) {
      for (var j = 0; j <= res; j++) {
        let nx = (j/res);
        let ny = (i/res);
        let lat = (ny * latDomain) + bounds.latMin;
        let lng = (nx * lngDomain) + bounds.lngMin;
        let z = topo.getElevation([lat, lng]);
        if (z < -90) z = -90;
        elevations.push(z);
        verts.push([nx * xDomain, ny * yDomain, z]);
      }
    }
    var sorted = elevations.slice(0).sort();
    var lowest = sorted[0];
    for (var i = 0; i < elevations.length; i++) {
      verts[i][2] -= lowest;
    }
    for (var i = 0; i < res; i++) {
      for (var j = 0; j < res; j++) {
        faces.push([(i + 1) + (res + 1) * j,  (i + 1) + (res + 1) * (j + 1), i + (res + 1) * (j + 1), i + (res + 1) * j ]);
      }
    }
    out.topography = {
      primitive: 'mesh', 
      faces: faces, 
      vertices: verts, 
      units: { vertices: 'meters' }, 
      attributes: { 
        materialProperties: { color: '#ffffff', opacity: 0.6 },
        elevation: lowest,
        latitude: bounds.latMin,
        longitude: bounds.lngMin
      }
    }
  }

  //** NODES
  let dataNodes = data.osm.node;
  for (let i = 0; i < dataNodes.length; i++) {
    let dataNode = dataNodes[i];
    let id = dataNode.$.id;
    let ny = (dataNode.$.lat - bounds.latMin) / latDomain; 
    let nx = (dataNode.$.lon - bounds.lngMin) / lngDomain;
    nodes[id] = { lat: dataNode.$.lat, lng: dataNode.$.lon, nx: nx, ny: ny, x: nx * xDomain, y: ny * yDomain, tags: {} };
  }

  //** WAYS
  let dataWays = data.osm.way;
  for (let i = 0; i < dataWays.length; i++) {
    let dataWay = dataWays[i];
    let id = dataWay.$.id;
    let way = { primitive: 'polyline', points: [], units: { points: 'meters' } };
    if (dataWay.nd) {
      if (features.topography) {
        for (let j = 0, jl = dataWay.nd.length; j < jl; j++) {
          let nid = dataWay.nd[j].$.ref;
          let lat = nodes[nid].lat;
          let lng = nodes[nid].lng;
          let cLat = lat < y0 ? y0 : lat > y1 ? y1 : lat;
          let cLng = lng < x0 ? x0 : lng > x1 ? x1 : lng;
          let z = topo.getElevation([cLat, cLng]);
          if (z < -90) z = -90;
          z -= lowest;
          way.points.push([nodes[nid].x, nodes[nid].y, z]);
        }
      } else {
        for (let j = 0, jl = dataWay.nd.length; j < jl; j++) {
          let nid = dataWay.nd[j].$.ref;
          way.points.push([nodes[nid].x, nodes[nid].y, 0]);
        }
      }
    }
    if (dataWay.tag) {
      for (let j = 0, jl = dataWay.tag.length; j < jl; j++) {
        let tag = dataWay.tag[j].$.k;
        if (features[tag]) {
          way.type = tag;
          switch (tag) {
            case 'highway':
              let value = dataWay.tag[j].$.v.split('_')[0];
              way.attributes = { 
                type: highways[value] || 0, 
                materialProperties: { color: '#0000ff', linewidth: 1 }
                latitude: bounds.latMin,
                longitude: bounds.lngMin
              }
              out.highway.push(way);
              break;
            case 'building':
              way.attributes = { 
                materialProperties: { color: '#ff0000', linewidth: 2 }
                latitude: bounds.latMin,
                longitude: bounds.lngMin
              }
              out[tag].push(way);
              break;
            default:
              way.attributes = { 
                materialProperties: { color: '#00ff00', linewidth: 1 }
                latitude: bounds.latMin,
                longitude: bounds.lngMin
              }
              out[tag].push(way);
              break;
          }
        }
      }
    }
  }
  return out;
}

module.exports = function(data, features, cb) {
  var bounds = data.bounds;
  var swKey = makeKey(bounds.latMin, bounds.lngMin);
  var neKey = makeKey(bounds.latMax, bounds.lngMax);
  if (features.topography && (config.downloadTiles || hasFile(swKey) && (swKey === neKey || !hasFile(neKey)))) {
    var topo = new SyncTileSet('./data/', [bounds.latMin, bounds.lngMin], [bounds.latMax, bounds.lngMax], function(err) {
      if (err) {
        features.topography = false;
        var osm = getOSM(data, features);
      } else {
        var osm = getOSM(data, features, topo);
      }
      if (osm) return cb(false, osm);
      else return cb('error with osm');
    });
  } else {
    features.topography = false;
    var osm = getOSM(data, features);
    if (osm) return cb(false, osm);
    else return cb('error with osm');
  }
}
