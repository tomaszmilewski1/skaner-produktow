"use client";
import { useState } from "react";
import Scanner from "../components/Scanner";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [ean, setEan] = useState(null);
  const [product, setProduct] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleScan = async (scannedEan) => {
    setEan(scannedEan);
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${scannedEan}.json`);
    const data = await res.json();
    setProduct(data.status === 1 ? data.product : { product_name: "Nieznany produkt", image_url: "" });
  };

  const saveRating = async () => {
    setIsSubmitting(true);
    const { error } = await supabase
      .from('reviews')
      .insert([{ ean, rating, comment: comment.trim() || null }]);
      
    setIsSubmitting(false);

    if (error) {
      alert("Błąd zapisu!");
    } else {
      alert("Ocena i recenzja zostały zapisane!");
      setComment("");
      setEan(null);
      setProduct(null);
    }
  };

  return (
    <main className="min-h-screen p-4 flex flex-col items-center bg-gray-50 text-black">
      <h1 className="text-2xl font-bold mb-6">Skaner Produktów</h1>
      
      {!ean && <Scanner onScan={handleScan} />}

      {product && (
        <div className="bg-white p-6 rounded-lg shadow-md flex flex-col items-center w-full max-w-sm">
          {product.image_url && (
            <img src={product.image_url} alt="Zdjęcie produktu" className="w-32 h-32 object-contain mb-4" />
          )}
          <h2 className="text-xl font-bold text-center">{product.product_name}</h2>
          <p className="text-gray-500 mb-4 text-sm">EAN: {ean}</p>

          <div className="flex gap-2 mb-4">
            {[1, 2, 3, 4, 5].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setRating(num)}
                className={`w-10 h-10 text-2xl pb-1 rounded-full transition-colors ${
                  rating >= num ? "bg-yellow-400 text-white" : "bg-gray-200 text-gray-400"
                }`}
              >
                ★
              </button>
            ))}
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Napisz swoją opinię o produkcie (opcjonalnie)..."
            rows={3}
            className="w-full p-2 border border-gray-300 rounded mb-4 text-sm focus:outline-none focus:border-blue-500"
          />

          <button
            onClick={saveRating}
            disabled={isSubmitting}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 rounded transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Zapisywanie..." : "Zapisz recenzję"}
          </button>

          <button
            onClick={() => { setEan(null); setProduct(null); setComment(""); }}
            className="mt-3 text-sm text-gray-500 underline"
          >
            Anuluj i skanuj inny produkt
          </button>
        </div>
      )}
    </main>
  );
}
