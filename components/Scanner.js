"use client";
import { useEffect } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

export default function Scanner({ onScan }) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 150 } });
    scanner.render(
      (text) => { scanner.clear(); onScan(text); },
      (err) => {}
    );
    return () => scanner.clear().catch(() => {});
  }, [onScan]);

  return <div id="reader" className="w-full max-w-md mx-auto rounded-lg overflow-hidden border-2 border-gray-200 bg-white"></div>;
}
