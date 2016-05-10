'use strict';

var path = require('path');
var express = require('express')
let xml = require('xml2js').parseString;
let bodyParser = require('body-parser');
var request = require('request');
let parse = require('./parse');
var app = express();

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.use(bodyParser.json());

app.post('/geo', function (req, res, next) {
  let coords = req.body.coordinates;
  request.get('http://overpass.osm.rambler.ru/cgi/xapi_meta?*[bbox=' + coords + ']', function(error, response, data) {
    if (error) return next(new Error('Could not reach data'));
    if (response.statusCode !== 200) return next(new Error('Error downloading data'));
    xml(data, function(error, result) {
      result.bounds = { latMin: coords[1], latMax: coords[3], lngMin: coords[0], lngMax: coords[2] }
      parse(result, req.body.features, (error, analyzed) => {
        if (error) next(new Error('Error analyzing data'));
        res.json(analyzed);
      });
    });
  });
});

app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname + '/public/index.html'));
});

app.use(express.static('public'));

app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', { message: err.message, error: {} });
});

app.listen(3000);
