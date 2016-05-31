var config = {
  url: 'http://localhost:8000', // your url
  fluxUrl: 'https://flux.io', // flux url
  port: 8000, // your app port
  portSSL: 8433, // your app secure port
  flux: '', // your flux key
  gmap: '', // your google maps key
  downloadTiles: false, // do you want to automatically download tiles
  sslKey: '/etc/letsencrypt/live/localhost/privkey.pem', // your letsencrypt ssl key
  sslCert: '/etc/letsencrypt/live/localhost/fullchain.pem',  // your letsencrypt ssl cert
  sslCA: '/etc/letsencrypt/live/localhost/chain.pem' // your letsencrypt ssl CA
}
if (typeof module !== 'undefined' && this.module !== module) module.exports = config;
else window.config = config;
