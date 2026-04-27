import QRCode from 'qrcode-svg';

export function qrCodeSvg(content?: string | null, size = 192): string {
  if (!content) return '';

  return new QRCode({
    content,
    width: size,
    height: size,
    padding: 14,
    ecl: 'Q',
    join: true,
    container: 'svg-viewbox',
    xmlDeclaration: false,
  }).svg();
}
