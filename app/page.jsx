"use client";
import { useState, useEffect } from "react";
import Scanner from "../components/Scanner";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  const [ean, setEan] = useState(null);
  const [manualQuery, setManualQuery] = useState("");
  const [product, setProduct] = useState(null);
  const [customName, setCustomName] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [price, setPrice] = useState("");
  const [store, setStore] = useState("Biedronka");
  const [isRecommended, setIsRecommended] = useState(true);
  const [reviews, setReviews] = useState([]);
  const [sortOrder, setSortOrder] = useState("newest");
  const [recentScans, setRecentScans] = useState([]);
  const [shoppingList, setShoppingList] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Zakładki: 'scan', 'profile', 'list'
  const [activeTab, setActiveTab] = useState("scan");
  const [userReviews, setUserReviews] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    const saved = localStorage.getItem("recent_scans");
    if (saved) setRecentScans(JSON.parse(saved));

    return () => subscription.unsubscribe();
  }, []);

  // Obsługa latarki
  const toggleTorch = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities();
      if (capabilities.torch) {
        await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
        setTorchOn(!torchOn);
      } else {
        alert("Twoje urządzenie nie pozwala na włączenie latarki z przeglądarki.");
      }
    } catch {
      alert("Błąd dostępu do flesza.");
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!authEmail) return;
    setAuthMessage("Wysyłanie linku...");
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail,
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) setAuthMessage("Błąd: " + error.message);
    else setAuthMessage("Link wysłany! Sprawdź pocztę i kliknij potwierdzenie.");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const loadShoppingList = async () => {
    if (!user) return;
    const { data } = await supabase.from("shopping_list").select("*").eq("user_id", user.id);
    if (data) setShoppingList(data);
  };

  const toggleShoppingList = async (targetEan, targetName) => {
    if (!user) return alert("Zaloguj się, aby zapisywać listę zakupów!");
    const exists = shoppingList.find((i) => i.ean === targetEan);
    if (exists) {
      await supabase.from("shopping_list").delete().eq("id", exists.id);
    } else {
      await supabase.from("shopping_list").insert([{ user_id: user.id, ean: targetEan, name: targetName }]);
    }
    loadShoppingList();
  };

  const fetchUserReviews = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("reviews")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setUserReviews(data);
  };

  useEffect(() => {
    if (activeTab === "profile") fetchUserReviews();
    if (activeTab === "list") loadShoppingList();
  }, [activeTab]);

  const fetchReviews = async (targetEan) => {
    setLoadingReviews(true);
    const { data } = await supabase
      .from("reviews")
      .select("*")
      .eq("ean", targetEan)
      .order("created_at", { ascending: false });

    if (data) {
      setReviews(data);
      if (user) {
        const myPrev = data.find((r) => r.user_id === user.id);
        if (myPrev) {
          setRating(myPrev.rating);
          setComment(myPrev.comment || "");
          setPrice(myPrev.price ? String(myPrev.price) : "");
          setStore(myPrev.store || "Biedronka");
          setIsRecommended(myPrev.is_recommended);
        }
      }
    }
    setLoadingReviews(false);
  };

  const loadProductData = async (targetEan) => {
    if (navigator.vibrate) navigator.vibrate(100);
    setEan(targetEan);

    const { data: nameData } = await supabase
      .from("product_names")
      .select("custom_name")
      .eq("ean", targetEan)
      .single();

    let fetchedName = nameData?.custom_name || null;
    let imgUrl = "";
    let nutriScore = null;
    let isVegan = null;
    let allergens = "";

    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${targetEan}.json`);
      const data = await res.json();
      if (data.status === 1) {
        if (!fetchedName) fetchedName = data.product.product_name;
        imgUrl = data.product.image_url || "";
        nutriScore = data.product.nutriscore_grade?.toUpperCase() || null;
        allergens = data.product.allergens_tags?.map((a) => a.replace("en:", "")).join(", ") || "";
        if (data.product.ingredients_analysis_tags) {
          isVegan = data.product.ingredients_analysis_tags.includes("en:vegan");
        }
      }
    } catch {}

    const finalName = fetchedName || "Nieznany produkt";
    setProduct({
      product_name: finalName,
      image_url: imgUrl,
      nutriScore,
      allergens,
      isVegan,
    });
    setCustomName(nameData?.custom_name || "");

    const updated = [{ ean: targetEan, name: finalName }, ...recentScans.filter((i) => i.ean !== targetEan)].slice(0, 5);
    setRecentScans(updated);
    localStorage.setItem("recent_scans", JSON.stringify(updated));

    await fetchReviews(targetEan);
  };

  const saveReview = async () => {
    setIsSubmitting(true);
    const trimmedCustom = customName.trim();

    if (trimmedCustom) {
      await supabase.from("product_names").upsert({ ean, custom_name: trimmedCustom }, { onConflict: "ean" });
      setProduct((prev) => ({ ...prev, product_name: trimmedCustom }));
    }

    if (user) {
      await supabase.from("reviews").delete().eq("ean", ean).eq("user_id", user.id);
    }

    const payload = {
      ean,
      rating,
      comment: comment.trim() || null,
      price: price ? parseFloat(price) : null,
      store,
      is_recommended: isRecommended,
      custom_name: trimmedCustom || null,
      user_id: user?.id || null,
    };

    const { error } = await supabase.from("reviews").insert([payload]);
    setIsSubmitting(false);

    if (error) {
      alert("Błąd zapisu!");
    } else {
      alert("Zapisano pomyślnie!");
      await fetchReviews(ean);
    }
  };

  const exportCSV = () => {
    if (!userReviews.length) return alert("Brak danych do pobrania.");
    let csv = "EAN,Nazwa,Ocena,Cena,Data\n";
    userReviews.forEach((r) => {
      csv += `"${r.ean}","${r.custom_name || ""}","${r.rating}","${r.price || ""}","${r.created_at}"\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "moje_oceny_produktow.csv";
    link.click();
  };

  const averageRating = reviews.length
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  const recommendPercent = reviews.length
    ? Math.round((reviews.filter((r) => r.is_recommended).length / reviews.length) * 100)
    : null;

  const validPrices = reviews.filter((r) => r.price).map((r) => r.price);
  const avgPrice = validPrices.length
    ? (validPrices.reduce((a, b) => a + b, 0) / validPrices.length).toFixed(2)
    : null;

  const sortedReviews = [...reviews].sort((a, b) => {
    if (sortOrder === "highest") return b.rating - a.rating;
    if (sortOrder === "lowest") return a.rating - b.rating;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return (
    <main className="min-h-screen p-4 flex flex-col items-center bg-slate-900 text-slate-100">
      {/* Pasek nawigacji */}
      <header className="w-full max-w-md flex justify-between items-center mb-4 pb-3 border-b border-slate-800 text-xs">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("scan")}
            className={`px-3 py-1.5 rounded font-bold ${activeTab === "scan" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            📷 Skaner
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`px-3 py-1.5 rounded font-bold ${activeTab === "list" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            🛒 Zakupy ({shoppingList.length})
          </button>
          <button
            onClick={() => setActiveTab("profile")}
            className={`px-3 py-1.5 rounded font-bold ${activeTab === "profile" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            👤 Konto
          </button>
        </div>

        {user && (
          <button onClick={handleLogout} className="text-rose-400 hover:underline">
            Wyloguj
          </button>
        )}
      </header>

      {/* Zakładka 1: Lista zakupów */}
      {activeTab === "list" && (
        <div className="w-full max-w-md bg-slate-800 p-5 rounded-xl border border-slate-700">
          <h2 className="text-lg font-bold mb-3">Twoja lista zakupów</h2>
          {shoppingList.length === 0 ? (
            <p className="text-xs text-slate-400">Brak artykułów na liście. Dodaj je skanując produkt!</p>
          ) : (
            <div className="flex flex-col gap-2">
              {shoppingList.map((item) => (
                <div key={item.id} className="flex justify-between items-center bg-slate-700/50 p-2.5 rounded border border-slate-600 text-xs">
                  <div>
                    <p className="font-bold text-white">{item.name}</p>
                    <p className="text-[10px] text-slate-400">EAN: {item.ean}</p>
                  </div>
                  <button
                    onClick={() => toggleShoppingList(item.ean, item.name)}
                    className="text-rose-400 font-semibold"
                  >
                    Kupione ✓
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Zakładka 2: Profil i eksport CSV */}
      {activeTab === "profile" && (
        <div className="w-full max-w-md bg-slate-800 p-5 rounded-xl border border-slate-700">
          {!user ? (
            <form onSubmit={handleAuth} className="flex flex-col gap-3">
              <h2 className="text-sm font-bold">Zaloguj się linkiem na e-mail</h2>
              <input
                type="email"
                placeholder="twoj@email.pl"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="bg-slate-700 border border-slate-600 p-2 rounded text-sm text-white outline-none"
              />
              <button type="submit" className="bg-blue-600 font-bold text-white py-2 rounded text-sm">
                Wyślij link logowania
              </button>
              {authMessage && <p className="text-xs text-amber-300">{authMessage}</p>}
            </form>
          ) : (
            <div>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-base font-bold">Twoje Oceny ({userReviews.length})</h2>
                  <p className="text-xs text-slate-400">{user.email}</p>
                </div>
                <button
                  onClick={exportCSV}
                  className="bg-emerald-600 text-white text-xs px-3 py-1.5 rounded font-bold"
                >
                  Pobierz CSV
                </button>
              </div>

              <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
                {userReviews.map((rev) => (
                  <div key={rev.id} className="bg-slate-700/40 p-2.5 rounded border border-slate-700 text-xs">
                    <div className="flex justify-between font-bold text-amber-400">
                      <span>{rev.custom_name || `EAN: ${rev.ean}`}</span>
                      <span>{"★".repeat(rev.rating)}</span>
                    </div>
                    {rev.comment && <p className="text-slate-300 mt-1">{rev.comment}</p>}
                    <p className="text-[10px] text-slate-500 mt-1">{new Date(rev.created_at).toLocaleDateString("pl-PL")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Zakładka 3: Skaner główny */}
      {activeTab === "scan" && (
        <>
          {!ean && (
            <div className="w-full max-w-md flex flex-col gap-4">
              <div className="relative">
                <Scanner onScan={loadProductData} />
                <button
                  onClick={toggleTorch}
                  className="absolute top-2 right-2 bg-black/60 border border-white/20 text-white text-xs px-2.5 py-1 rounded backdrop-blur"
                >
                  🔦 {torchOn ? "Wyłącz flesz" : "Włącz flesz"}
                </button>
              </div>

              {/* Szukajka ręczna (kod lub nazwa) */}
              <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex gap-2">
                <input
                  type="text"
                  placeholder="Wpisz EAN..."
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  className="bg-slate-700 border border-slate-600 p-2 rounded flex-1 text-sm text-white outline-none"
                />
                <button
                  onClick={() => manualQuery && loadProductData(manualQuery.trim())}
                  className="bg-blue-600 px-4 rounded text-sm font-bold text-white"
                >
                  Szukaj
                </button>
              </div>

              {recentScans.length > 0 && (
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Ostatnio skanowane</h4>
                  <div className="flex flex-col gap-1.5">
                    {recentScans.map((item) => (
                      <button
                        key={item.ean}
                        onClick={() => loadProductData(item.ean)}
                        className="text-left text-xs text-blue-400 hover:underline truncate"
                      >
                        {item.name} ({item.ean})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {product && (
            <div className="w-full max-w-md flex flex-col gap-4">
              <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 flex flex-col items-center">
                {product.image_url && (
                  <img src={product.image_url} alt="Produkt" className="w-32 h-32 object-contain mb-3 bg-white rounded-lg p-1" />
                )}

                <h2 className="text-lg font-bold text-center text-white">{product.product_name}</h2>
                <p className="text-slate-400 text-xs mb-3">EAN: {ean}</p>

                {/* Etykiety Zdrowotne: Nutri-Score, Alergeny, Vegan */}
                <div className="flex flex-wrap gap-2 justify-center mb-4 text-xs font-bold">
                  {product.nutriScore && (
                    <span className="bg-emerald-900 text-emerald-300 border border-emerald-500 px-2 py-0.5 rounded">
                      Nutri-Score: {product.nutriScore}
                    </span>
                  )}
                  {product.isVegan !== null && (
                    <span className="bg-lime-900 text-lime-300 border border-lime-500 px-2 py-0.5 rounded">
                      {product.isVegan ? "🌱 Wegański" : "🥩 Niewegański"}
                    </span>
                  )}
                  {product.allergens && (
                    <span className="bg-amber-900 text-amber-300 border border-amber-500 px-2 py-0.5 rounded">
                      ⚠️ Alergeny: {product.allergens}
                    </span>
                  )}
                </div>

                {/* Zapis własnej nazwy produktu */}
                <div className="w-full mb-3">
                  <label className="text-[11px] text-slate-300 block mb-1">
                    {product.product_name === "Nieznany produkt" ? "Nadaj stałą nazwę temu produktowi:" : "Zmień/popraw nazwę dla wszystkich:"}
                  </label>
                  <input
                    type="text"
                    placeholder="Wpisz pełną nazwę..."
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full bg-slate-700 border border-amber-500/50 p-2 rounded text-sm text-white outline-none"
                  />
                </div>

                {/* Statystyki: Średnia, % Poleceń, Śr. Cena */}
                <div className="grid grid-cols-3 gap-2 w-full mb-4 text-center">
                  <div className="bg-slate-700/60 border border-slate-600 rounded p-2">
                    <span className="text-lg font-bold text-blue-400">{averageRating || "-"}</span>
                    <span className="text-[10px] text-slate-400 block">/ 5 ★ ({reviews.length})</span>
                  </div>
                  <div className="bg-slate-700/60 border border-slate-600 rounded p-2">
                    <span className="text-lg font-bold text-emerald-400">{recommendPercent !== null ? `${recommendPercent}%` : "-"}</span>
                    <span className="text-[10px] text-slate-400 block">poleca</span>
                  </div>
                  <div className="bg-slate-700/60 border border-slate-600 rounded p-2">
                    <span className="text-lg font-bold text-purple-400">{avgPrice ? `${avgPrice} zł` : "-"}</span>
                    <span className="text-[10px] text-slate-400 block">śr. cena</span>
                  </div>
                </div>

                {/* Formularz Recenzji */}
                <div className="flex gap-2 mb-3">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setRating(num)}
                      className={`w-9 h-9 text-xl rounded-full ${rating >= num ? "bg-amber-400 text-slate-900" : "bg-slate-700 text-slate-500"}`}
                    >
                      ★
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2 w-full mb-3">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Cena (zł)"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="bg-slate-700 border border-slate-600 p-2 rounded text-xs text-white outline-none"
                  />
                  <select
                    value={store}
                    onChange={(e) => setStore(e.target.value)}
                    className="bg-slate-700 border border-slate-600 p-2 rounded text-xs text-white outline-none"
                  >
                    <option value="Biedronka">Biedronka</option>
                    <option value="Lidl">Lidl</option>
                    <option value="Dino">Dino</option>
                    <option value="Kaufland">Kaufland</option>
                    <option value="Żabka">Żabka</option>
                    <option value="Inny">Inny sklep</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsRecommended(!isRecommended)}
                    className={`border rounded text-[11px] font-bold ${isRecommended ? "bg-emerald-950 border-emerald-500 text-emerald-300" : "bg-rose-950 border-rose-500 text-rose-300"}`}
                  >
                    {isRecommended ? "👍 Polecam" : "👎 Odradzam"}
                  </button>
                </div>

                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Komentarz do oceny..."
                  rows={2}
                  className="w-full bg-slate-700 border border-slate-600 p-2 rounded mb-3 text-sm text-white outline-none"
                />

                <button
                  onClick={saveReview}
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded text-sm disabled:opacity-50 transition-colors mb-2"
                >
                  {isSubmitting ? "Zapisywanie..." : "Zapisz recenzję"}
                </button>

                <div className="flex justify-between w-full text-xs text-slate-400 mt-2">
                  <button
                    onClick={() => toggleShoppingList(ean, product.product_name)}
                    className="text-amber-400 font-semibold"
                  >
                    {shoppingList.some((i) => i.ean === ean) ? "✓ Na liście zakupów" : "+ Dodaj do listy"}
                  </button>
                  <button
                    onClick={() => {
                      setEan(null);
                      setProduct(null);
                    }}
                    className="underline text-slate-300"
                  >
                    Skanuj kolejny
                  </button>
                </div>
              </div>

              {/* Lista opinii */}
              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-sm text-white">Opinie ({reviews.length})</h3>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="text-xs bg-slate-700 border border-slate-600 p-1 rounded text-white"
                  >
                    <option value="newest">Najnowsze</option>
                    <option value="highest">Najwyższa ocena</option>
                    <option value="lowest">Najniższa ocena</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2.5">
                  {sortedReviews.map((rev) => (
                    <div key={rev.id} className="border-b border-slate-700/60 pb-2 last:border-0 text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-amber-400 font-bold">{"★".repeat(rev.rating)}</span>
                        <span className="text-slate-500 text-[10px]">{new Date(rev.created_at).toLocaleDateString("pl-PL")}</span>
                      </div>
                      <div className="flex gap-2 text-[11px] text-slate-400 mb-1">
                        <span>{rev.is_recommended ? "👍 Poleca" : "👎 Odradza"}</span>
                        {rev.price && <span>• {rev.price} zł ({rev.store || "Sklep"})</span>}
                      </div>
                      {rev.comment && <p className="text-slate-200">{rev.comment}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
