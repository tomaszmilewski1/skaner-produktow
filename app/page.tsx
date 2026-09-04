"use client";
import { useState } from "react";
import Scanner from "../components/Scanner";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [ean, setEan] = useState(null);
  const [product, setProduct] = useState(null);
  const [rating, setRating] = useState(5);

  const handleScan = async (scannedEan) => {
    setEan(scannedEan);
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${scannedEan}.json`);
    const data = await res.json();
    setProduct(data.status === 1 ? data.product : { product_name: "Nieznany produkt", image_url: "" });
  };

  const saveRating = async () => {
    const { error } = await supabase.from('reviews').insert([{ ean, rating }]);
    alert(error ? "Błąd zapisu!" : "Ocena zapisana!");
  };

  return (
    <main className="min-h-screen p-4 flex flex-col items-center bg-gray-50 text-black">
      <h1 className="text-2xl font-bold mb-6">Skaner Produktów</h1>
      {!ean && <Scanner onScan={handleScan} />}
      {product && (
        <div className="bg-white p-6 rounded-lg shadow flex flex-col items-center">
          {product.image_url && <img src={product.image_url} className="w-32 h-32 object-contain mb-4" />}
          <h2 className="text-xl font-bold text-center">{product.product_name}</h2>
          <p className="text-gray-500 mb-4">EAN: {ean}</p>
          <div className="flex gap-2 mb-4">
            {[1,2,3,4,5].map(num => (
              <button key={num} onClick={() => setRating(num)} className={`w-10 h-10 text-2xl pb-1 rounded-full ${rating >= num ? 'bg-yellow-400' : 'bg-gray-200'}`}>★</button>
            ))}
          </div>
          <button onClick={saveRating} className="bg-blue-500 text-white px-6 py-2 rounded font-bold">Zapisz ocenę</button>
        </div>
      )}
    </main>
  );
}
