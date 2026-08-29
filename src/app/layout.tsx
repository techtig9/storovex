import React from "react";
import "./globals.css";

export const metadata={
 title:"Storovex — AI product photography for online stores",
 description:"Generate studio-quality product photography, lifestyle scenes, and campaign creative for your store without a photo shoot.",
};

export default function RootLayout({children}:{children:React.ReactNode}){
 return (
  <html lang="en">
   <body>{children}</body>
  </html>
 );
}
