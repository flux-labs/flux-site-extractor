'use strict'

var offset = 0.005;
let loading = false;
let baseName = 'Site Features Project';
let rectangle;

loadGoogleMaps(config.gmap.key);
setFluxLogin();

function loadGoogleMaps(key) {
  var js, s = document.getElementsByTagName('script')[0];
  if (document.getElementById('gmap')) return;
  js = document.createElement('script'); js.id = 'gmap';
  js.src = 'https://maps.googleapis.com/maps/api/js?key=' + key + '&libraries=drawing,places&callback=initMap';
  s.parentNode.insertBefore(js, s);
}

function onError(error) {
  console.log('error', error);
}

function checkLogin() {
  var credentials = getFluxCredentials();
  if (!credentials) return Promise.reject()
  var user = sdk.getUser(credentials);
  return user.listProjects();
}

function showLogin(err) {
  localStorage.removeItem('fluxCredentials');
  $('#login').show();
  $('#projects').hide();
  $('#export').addClass('disabled');
  $('#login button').on('click', getFluxLogin);
}

function getCoords(rectangle) {
  var ne = rectangle.getBounds().getNorthEast();
  var sw = rectangle.getBounds().getSouthWest();
  return [sw.lng(), sw.lat(), ne.lng(), ne.lat()];
}

function checkRectangle(rectangle) {
  let limit = 0.012;
  let coords = getCoords(rectangle);
  if (Math.abs(coords[3] - coords[1]) > limit || Math.abs(coords[2] - coords[0]) > limit) return false
  else return true
}

function fillProjects(projects) {
  var hasBaseProject = false;
  $('#projectlist .menu').empty();
  for (let p of projects.entities) {
    if (p.name === baseName) hasBaseProject = true;
    $('#projectlist .menu').append('<div class="item" value="' + p.name + '" data-id="' + p.id + '">' + p.name + '</div>');
  }
  if (!hasBaseProject) {
    $('#projectlist .menu').prepend('<div class="item" value="' + baseName + '"data-id="0">' + baseName + '</div>');
  }
  $('#projectlist .menu').attr("size", projects.entities.length+1);
  $('#projectlist').dropdown('set selected', baseName);
}

function save() {
  if (loading) return onError('Please wait')
  if (!checkRectangle(rectangle)) return onError('Please make a smaller rectangle')
  checkLogin().then(function() {
    loading = true;
    let coords = getCoords(rectangle);
    $('#export').addClass('loading');
    let save = {
      building: !$('#item-buildings .input').hasClass('disabled'),
      highway: !$('#item-roads .input').hasClass('disabled'),
      topography: !$('#item-topography .input').hasClass('disabled')
    }
    let options = {
      coordinates: coords,
      features: {highway: save.highway, building: save.building, topography: save.topography}
    }
    $.ajax({ url: 'geo/', type: 'POST', contentType: 'application/json', data: JSON.stringify(options), success: function(data) {
      $('#export').removeClass('loading');
      loading = false;
      let pid = $('#projectlist .menu .item.selected').attr('data-id');
      if (pid === '0') {
        createProject(baseName).then(function(project) {
          $('#projectlist .menu .item.selected').attr('data-id', project.id);
          saveProject(data, project.id, options);
        });
      } else {
        saveProject(data, pid, options);
      }
    }})
  }).catch(onError.bind('Please log in'))
}

function saveProject(data, pid, options) {
  let labels = {
    building: $('#item-buildings input[type="text"]').val(),
    highway: $('#item-roads input[type="text"]').val(),
    topography: $('#item-topography input[type="text"]').val()
  }
  var user = getUser();
  var project = user.getProject(pid);
  var dt = project.getDataTable();
  let cells = dt.listCells().then(function(cells) {
    var update = {};
    cells.entities.map(function (cell) {
      if (labels[cell.description] && labels[cell.description] === cell.label) {
        update[cell.description] = cell;
      }
    });
    for (var key in labels) {
      if (options.features[key]) {
        if (update[key]) {
          let cell = createCell(pid, update[key].id);
          cell.update({value: data[key]});
        } else {
          dt.createCell(labels[key], {description: key, value: data[key]});
        }
      }
    }
    var win = window.open('https://flux.io/p/' + pid + '/#!/data-view', '_blank');
    if (win) win.focus();
  });
}

function initMap() {
  var center = {lat: 37.7719981, lng: -122.4115472}
  var map = new google.maps.Map(document.getElementById('map'), { center: center, zoom: 15, streetViewControl: false });
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function (position) {
      map.setCenter(new google.maps.LatLng(position.coords.latitude, position.coords.longitude));
      center.lat = position.coords.latitude;
      center.lng = position.coords.longitude;
    });
  }
  var rectangleBounds = { north: center.lat + offset, south: center.lat - offset, east: center.lng + offset, west: center.lng - offset };
  rectangle = new google.maps.Rectangle({ bounds: rectangleBounds, editable: true, draggable: true });
  rectangle.setMap(map);

  var input = document.getElementById('search-box');
  var searchBox = new google.maps.places.SearchBox(input);

  let errorRectangle = {
    strokeColor: '#FF0000',
    strokeOpacity: 0.8,
    strokeWeight: 4,
    fillColor: '#FF0000',
    fillOpacity: 0.35,
  }
  let okRectangle = {
    strokeColor: '#000000',
    strokeOpacity: 0.8,
    strokeWeight: 3,
    fillColor: '#FFFFFF',
    fillOpacity: 0.35,
  }
  rectangle.setOptions(okRectangle);
  rectangle.addListener('bounds_changed', function() {
    searchBox.setBounds(map.getBounds());
    if (checkRectangle(rectangle)) rectangle.setOptions(okRectangle);
    else rectangle.setOptions(errorRectangle);
  });
  searchBox.addListener('places_changed', function() {
    var places = searchBox.getPlaces();
    if (places.length == 0) return;
    var bounds = new google.maps.LatLngBounds();
    places.forEach(function(place) {
      if (place.geometry.viewport) bounds.union(place.geometry.viewport);
      else bounds.extend(place.geometry.location);
    });
    // make new rectangle with offset of bounds
    var ne = bounds.getNorthEast();
    var sw = bounds.getSouthWest();
    var center = bounds.getCenter();
    rectangle.setOptions({
      bounds: { north: center.lat() + offset, south: center.lat() - offset, east: center.lng() + offset, west: center.lng() - offset }
    });
    map.setCenter(bounds.getCenter());
    map.setZoom(16);
  });
}

$(document).ready(function() {
  checkLogin().then(function(projects) {
    $('#login').hide();
    fillProjects(projects);
  }).catch(showLogin);
  $('#export').click(save);
  $('.ui.toggle').click(function() {
    if ($(this).hasClass('checked')) {
      $(this).removeClass('checked');
      $($(this).parent().children()[1]).addClass('disabled');
    } else {
      $(this).addClass('checked');
      $($(this).parent().children()[1]).removeClass('disabled');
    }
  })
}); 

