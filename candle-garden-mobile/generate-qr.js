const QRCode = require('qrcode');

const url = process.argv[2] || 'exp://ziwk7aw-anonymous-8081.exp.direct';

console.log('Generating QR code for:', url);
console.log('');

QRCode.toString(url, { type: 'terminal' }, function (err, url) {
  if (err) throw err
  console.log(url)
});

QRCode.toFile('./qr-code.png', url, {
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  }
}, function(err) {
  if (err) throw err
  console.log('QR code saved to qr-code.png');
});
