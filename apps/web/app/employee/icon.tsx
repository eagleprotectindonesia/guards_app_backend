import { ImageResponse } from 'next/og'

// 1. Define the sizes you want to generate
export function generateImageMetadata() {
  return [
    {
      id: 'icon-192',
      size: { width: 192, height: 192 },
      contentType: 'image/png',
    },
    {
      id: 'icon-512',
      size: { width: 512, height: 512 },
      contentType: 'image/png',
    },
  ]
}

// 2. The component that "paints" the icon
export default async function Icon({ id }: { id: string }) {
  const isLarge = id === 'icon-512'
  const isMaskable = id === 'icon-maskable'
  const size = isLarge ? 512 : 192
  
  // Design your "Fake App" icon with CSS
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#eee', // Your theme color
          borderRadius: '22%', // Standard "App" squircle look
          padding: isMaskable ? '10%' : '0%',
        }}
      >
        {/* Replace the URL with your absolute production URL or local SVG path */}
        <img
          src="http://localhost:3000/employee/icons/icon.svg"
          alt="EP Guard Icon"
          width={isLarge ? '380' : '140'}
          height={isLarge ? '380' : '140'}
          style={{
            objectFit: 'contain',
          }}
        />
      </div>
    ),
    {
      width: size,
      height: size,
    }
  )
}