import type { Metadata } from 'next';
import './globals.css';
import { UIStyles } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Atrium — Learning',
  description: 'A focused learning environment.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <UIStyles />
        {children}
      </body>
    </html>
  );
}
