declare module 'qrcode-svg' {
  export default class QRCode {
    constructor(options: {
      content: string;
      width?: number;
      height?: number;
      padding?: number;
      ecl?: 'L' | 'M' | 'Q' | 'H';
      join?: boolean;
      container?: 'svg' | 'svg-viewbox' | 'g' | 'none';
      xmlDeclaration?: boolean;
      color?: string;
      background?: string;
    });

    svg(): string;
  }
}
