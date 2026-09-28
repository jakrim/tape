import { useMemo } from 'react';
import createQR from 'qrcode-generator';
import Svg, { Path, Rect } from 'react-native-svg';

/** Encodes only the public address, locally. The adjacent label supplies the network. */
export function AddressQR({ address }: { address: string }) {
  const { path, size } = useMemo(() => {
    const qr = createQR(0, 'M');
    qr.addData(address, 'Byte');
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) path += `M${col + 4},${row + 4}h1v1h-1z`;
      }
    }
    return { path, size: count + 8 };
  }, [address]);
  return (
    <Svg width={220} height={220} viewBox={`0 0 ${size} ${size}`} accessibilityLabel="Public wallet address QR code">
      <Rect width={size} height={size} fill="#FFFFFF" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}
