'use strict'

var offset = 0.005;
let loading = false;
let baseName = 'Flux Site Project';
let rectangle;

loadGoogleMaps(config.gmap);
setFluxLogin();

function loadGoogleMaps(key) {
  var js, s = document.getElementsByTagName('script')[0];
  if (document.getElementById('gmap')) return;
  js = document.createElement('script'); js.id = 'gmap';
  js.src = 'https://maps.googleapis.com/maps/api/js?key=' + key + '&libraries=drawing,places&callback=initMap';
  s.parentNode.insertBefore(js, s);
}

function onError(error) {
  var $send = $('#send');
  $send.attr('data-content', error).popup('show');
}

function checkErrors() {
  if (!checkRectangle(rectangle)) return 'Please make a smaller rectangle';
  return false;
}

function onHoverSend() {
  var error = checkErrors();
  if (error) {
    $('#send').addClass('disabled')
      .attr('data-content', error)
      // .popup({position: 'bottom center'}).popup('show');
      .popup('show');
  } else {
    $('#send').removeClass('disabled').attr('data-content', '');
  }
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
  $('#send').addClass('disabled').attr('data-content', 'Please log in');
  $('#login button').on('click', getFluxLogin);
}

function getCoords(rectangle) {
  var ne = rectangle.getBounds().getNorthEast();
  var sw = rectangle.getBounds().getSouthWest();
  return [sw.lng(), sw.lat(), ne.lng(), ne.lat()];
}

function checkRectangle(rectangle) {
  let limit = 0.0003;
  let coords = getCoords(rectangle);
  if (Math.abs(coords[3] - coords[1]) * Math.abs(coords[2] - coords[0]) > limit) return false
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
  $('#projectlist').change(hideOpenLink);
}

function save() {
  if (loading) return onError('Please wait');
  var error = checkErrors();
  if (error) return onError(error);
  checkLogin().then(function() {
    loading = true;
    hideOpenLink();
    var coords = getCoords(rectangle);
    var $send = $('#send');
    $send.addClass('loading')
         .attr('data-content', 'this might take a minute')
         .popup('show');
    var other = $('#toggle-other').hasClass('checked')
    var save = {
      building: $('#toggle-buildings').hasClass('checked'),
      building_3d: $('#toggle-buildings-3d').hasClass('checked'),
      building_3d_random: $('#toggle-buildings-3d-random').hasClass('checked'),
      highway: other,
      parks: other,
      water: other,
      topography: $('#toggle-topography').hasClass('checked'),
      contours: $('#toggle-contours').hasClass('checked'),
    }
    var options = {
      coordinates: coords,
      features: {
        highway: save.highway, 
        building: save.building, 
        building_3d: save.building_3d, 
        building_3d_random: save.building_3d_random,
        topography: save.topography, 
        contours: save.contours, 
        waterway: save.water, 
        leisure: save.parks, 
      },
    }
    options.contour_interval = parseInt($('#contour-interval').val())
    options.random_min = parseFloat($('#random-min').val())
    options.random_max = parseFloat($('#random-max').val())
    options.high_res = $('#toggle-resolution').hasClass('checked')
    $.ajax({ url: 'geo/', type: 'POST', contentType: 'application/json', data: JSON.stringify(options), success: function(data) {
      $send.popup('hide')
           .removeClass('loading')
           .attr('data-content', '');
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
  let keys = {
    'Contour Lines': 'contours',
    'Building Profiles': 'building',
    'Buildings (accurate height)': 'building_3d',
    'Buildings (randomized height)': 'building_3d_random',
    'Roads': 'highway',
    'Topographic Mesh': 'topography',
    'Parks': 'leisure',
    'Water': 'waterway' 
  }
  var user = getUser();
  var project = user.getProject(pid);
  var dt = project.getDataTable();
  let cells = dt.listCells().then(function(cells) {
    var update = {};
    cells.entities.map(function (cell) {
      if (keys[cell.description]) {
        update[cell.description] = cell;
      }
    });
    for (var k in keys) {
      if (options.features[keys[k]] && data[keys[k]]) {
        if (update[k]) {
          let cell = createCell(pid, update[k].id);
          cell.update({value: data[keys[k]]});
        } else {
          dt.createCell(k, {description: k, value: data[keys[k]]});
        }
      }
    }
    showOpenLink(config.fluxUrl + '/p/' + pid + '/#!/data-view', '_blank');
  })
}

function showOpenLink(url) {
  $('#open').fadeIn(0.25).on('click', function() {
    hideOpenLink()
    var win = window.open(url);
    if (win) win.focus();
  });
}

function hideOpenLink() {
  $('#open').fadeOut(0.25).off();
}

function initMap() {
  var center = {lat: 37.7719981, lng: -122.4115472}
  var map = new google.maps.Map(document.getElementById('map'), { center: center, zoom: 15, streetViewControl: false });
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function (position) {
      map.setCenter(new google.maps.LatLng(position.coords.latitude, position.coords.longitude));
      var lat = position.coords.latitude;
      var lng = position.coords.longitude;
      rectangle.setOptions({
        bounds: { north: lat + offset, south: lat - offset, east: lng + offset, west: lng - offset }
      });
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
  $('#projectlist').popup({ position: 'top center' })
  var $send = $('#send');
  $send.on('mouseover', onHoverSend).popup({ position : 'bottom center' });
  checkLogin().then(function(projects) {
    $('#login').hide();
    $('.ui.accordion').accordion()
    $send.attr('data-content', '').click(save);
    fillProjects(projects);
  }).catch(showLogin);
  $('#random-min, #random-max, #contour-interval').click(function(e) {
    e.stopPropagation()

  });
  $('.ui.checkbox').checkbox('set checked')
  $('.ui.checkbox').click(function() {
    if ($(this).hasClass('checked')) {
      $(this).removeClass('checked');
      $($(this).parent().children()[1]).addClass('disabled');
    } else {
      $(this).addClass('checked');
      $($(this).parent().children()[1]).removeClass('disabled');
    }
  })
}); 

