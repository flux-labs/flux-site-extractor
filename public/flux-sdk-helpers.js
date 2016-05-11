var sdk = new FluxSdk(config.flux, { redirectUri: config.url, fluxUrl: config.fluxUrl });

function getFluxLogin() {
  if (!window.location.hash.match(/access_token/)) {
    window.location.replace(sdk.getAuthorizeUrl(getState(), getNonce()));
  }
}

function setFluxLogin() {
  if (!getFluxCredentials() && window.location.hash.match(/access_token/)) {
  sdk.exchangeCredentials(getState(), getNonce())
    .then(function(credentials) { setFluxCredentials(credentials); })
    .then(function() { window.location.replace(config.url); });
  }
}

function createProject(name) {
  var credentials = getFluxCredentials();
  return sdk.Project.createProject(credentials, name);
}

function createCell(pid, key) {
  var credentials = getFluxCredentials();
  return new sdk.Cell(credentials, pid, key);
}

function getUser() {
  var credentials = getFluxCredentials();
  return sdk.getUser(credentials);
}

function getProjects() {
  return getUser().listProjects();
}

function getDataTable(project) {
  return new sdk.Project(getFluxCredentials(), project.id).getDataTable();
}

function getKeys(project) {
  return getDataTable(project).listCells();
}

function getCell(project, key) {
  return getDataTable(project).getCell(key.id);
}

function getValue(project, key) {
  return getCell(project, key).fetch();
}

function getFluxCredentials() {
  return JSON.parse(localStorage.getItem('fluxCredentials'));
}

function setFluxCredentials(credentials) {
  localStorage.setItem('fluxCredentials', JSON.stringify(credentials));
}

function generateRandomToken() {
  var tokenLength = 24;
  var randomArray = [];
  var characterSet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (var i = 0; i < tokenLength; i++) {
    randomArray.push(Math.floor(Math.random() * tokenLength));
  }
  return btoa(randomArray.join('')).slice(0, 48);
}

function getState() {
  var state = localStorage.getItem('state') || generateRandomToken();
  localStorage.setItem('state', state);
  return state;
}

function getNonce() {
  var nonce = localStorage.getItem('nonce') || generateRandomToken();
  localStorage.setItem('nonce', nonce);
  return nonce;
}
