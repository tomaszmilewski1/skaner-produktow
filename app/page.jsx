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
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Zakładki menu: 'scan', 'profile', 'list'
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

  // Włącznik latarki / flesza
  const toggleTorch = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities();
      if (capabilities.torch) {
        await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
        setTorchOn(!torchOn);
      } else {
        alert("Twoje urządzenie nie pozwala na włączenie latarki w przeglądarce.");
      }
    } catch {
      alert("Brak dostępu do modułu flesza.");
    }
  };

  // Logowanie linkiem Magic Link
  const handleAuth = async (e) => {
    e.preventDefault();
    if (!authEmail) return;
    setAuthMessage("Wysyłanie linku...");
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail,
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) setAuthMessage("Błąd: " + error.message);
    else setAuthMessage("Link wysłany! Otwórz pocztę i kliknij potwierdzenie.");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  // Lista zakupowa
  const loadShoppingList = async () => {
    if (!user) return;
    const { data } = await supabase.from("shopping_list").select("*").eq("user_id", user.id);
    if (data) setShoppingList(data);
  };

  const toggleShoppingList = async (targetEan, targetName) => {
    if (!user) return alert("Zaloguj się, aby tworzyć własną listę zakupów!");
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

  // Wyszukiwarka tekstowa produktów
  const handleTextSearch = async () => {
    if (!manualQuery.trim()) return;
    // Sprawdź, czy wpisano sam kod EAN (same cyfry)
    if (/^\d+$/.test(manualQuery.trim())) {
      loadProductData(manualQuery.trim());
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(manualQuery)}&search_simple=1&action=process&json=1&page_size=5`);
      const data = await res.json();
      setSearchResults(data.products || []);
    } catch {
      alert("Błąd podczas wyszukiwania produktów.");
    }
    setSearching(false);
  };

  // Wgrywanie własnego zdjęcia do Supabase Storage
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !ean) return;

    setUploadingImage(true);
    const fileExt = file.name.split(".").pop();
    const filePath = `${ean}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from("product-images").upload(filePath, file);

    if (uploadError) {
      alert("Błąd wgrywania zdjęcia: " + uploadError.message);
      setUploadingImage(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("product-images").getPublicUrl(filePath);

    await supabase.from("product_names").upsert(
      { ean, custom_name: customName || product.product_name, custom_image: publicUrl },
      { onConflict: "ean" }
    );

    setProduct((prev) => ({ ...prev, image_url: publicUrl }));
    setUploadingImage(false);
    alert("Zdjęcie zostało dodane!");
  };

  const loadProductData = async (targetEan) => {
    if (navigator.vibrate) navigator.vibrate(100);
    setEan(targetEan);
    setSearchResults([]);

    const { data: nameData } = await supabase
      .from("product_names")
      .select("custom_name, custom_image")
      .eq("ean", targetEan)
      .single();

    let fetchedName = nameData?.custom_name || null;
    let imgUrl = nameData?.custom_image || "";
    let nutriScore = null;
    let ecoScore = null;
    let isVegan = null;
    let allergens = "";

    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${targetEan}.json`);
      const data = await res.json();
      if (data.status === 1) {
        if (!fetchedName) fetchedName = data.product.product_name;
        if (!imgUrl) imgUrl = data.product.image_url || "";
        nutriScore = data.product.nutriscore_grade?.toUpperCase() || null;
        ecoScore = data.product.ecoscore_grade?.toUpperCase() || null;
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
      ecoScore,
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
      await supabase.from("product_names").upsert(
        { ean, custom_name: trimmedCustom },
        { onConflict: "ean" }
      );
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
      alert("Zapisano!");
      await fetchReviews(ean);
    }
  };

  // Eksport bazy do CSV
  const exportCSV = () => {
    if (!userReviews.length) return alert("Brak danych do pobrania.");
    let csv = "EAN,Nazwa,Ocena,Cena,Sklep,Data\n";
    userReviews.forEach((r) => {
      csv += `"${r.ean}","${r.custom_name || ""}","${r.rating}","${r.price || ""}","${r.store || ""}","${r.created_at}"\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "moje_recenzje.csv";
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

      {/* ZAKŁADKA 1: LISTA ZAKUPÓW */}
      {activeTab === "list" && (
        <div className="w-full max-w-md bg-slate-800 p-5 rounded-xl border border-slate-700">
          <h2 className="text-lg font-bold mb-3">Twoja lista zakupów</h2>
          {shoppingList.length === 0 ? (
            <p className="text-xs text-slate-400">Brak artykułów. Dodaj je, skanując produkt i klikając "+ Dodaj do listy".</p>
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

      {/* ZAKŁADKA 2: PROFIL I EKSPORT */}
      {activeTab === "profile" && (
        <div className="w-full max-w-md bg-slate-800 p-5 rounded-xl border border-slate-700">
          {!user ? (
            <form onSubmit={handleAuth} className="flex flex-col gap-3">
              <h2 className="text-sm font-bold">Zaloguj się adresem e-mail</h2>
              <input
                type="email"
                placeholder="twoj@email.pl"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="bg-slate-700 border border-slate-600 p-2 rounded text-sm text-white outline-none"
              />
              <button type="submit" className="bg-blue-600 font-bold text-white py-2 rounded text-sm">
                Wyślij link
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
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                      <span>{rev.store && `Sklep: ${rev.store}`} {rev.price && `(${rev.price} zł)`}</span>
                      <span>{new Date(rev.created_at).toLocaleDateString("pl-PL")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ZAKŁADKA 3: SKANER I WYNIKI */}
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

              {/* Ręczna wyszukiwarka kodem lub nazwą */}
              <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex gap-2">
                <input
                  type="text"
                  placeholder="Wpisz kod EAN lub nazwę towaru..."
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  className="bg-slate-700 border border-slate-600 p-2 rounded flex-1 text-sm text-white outline-none"
                />
                <button
                  onClick={handleTextSearch}
                  disabled={searching}
                  className="bg-blue-600 px-4 rounded text-sm font-bold text-white disabled:opacity-50"
                >
                  {searching ? "..." : "Szukaj"}
                </button>
              </div>

              {/* Lista wyników wyszukiwania tekstowego */}
              {searchResults.length > 0 && (
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex flex-col gap-2">
                  <h4 className="text-xs font-bold text-slate-300">Wyniki wyszukiwania:</h4>
                  {searchResults.map((prod) => (
                    <button
                      key={prod.code}
                      onClick={() => loadProductData(prod.code)}
                      className="flex items-center gap-2 p-2 bg-slate-700/50 hover:bg-slate-700 rounded text-left"
                    >
                      {prod.image_small_url && <img src={prod.image_small_url} className="w-8 h-8 object-contain" />}
                      <div className="flex-1 truncate">
                        <p className="text-xs font-bold text-white truncate">{prod.product_name || "Bez nazwy"}</p>
                        <p className="text-[10px] text-slate-400">EAN: {prod.code}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

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
                {product.image_url ? (
                  <img src={product.image_url} alt="Produkt" className="w-32 h-32 object-contain mb-3 bg-white rounded-lg p-1" />
                ) : (
                  <div className="mb-3 text-center">
                    <label className="cursor-pointer bg-slate-700 border border-slate-600 px-3 py-2 rounded text-xs text-blue-400 font-bold block">
                      📷 {uploadingImage ? "Wgrywanie..." : "Dodaj zdjęcie produktu"}
                      <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
                    </label>
                  </div>
                )}

                <h2 className="text-lg font-bold text-center text-white">{product.product_name}</h2>
                <p className="text-slate-400 text-xs mb-3">EAN: {ean}</p>

                {/* Etykiety: Nutri-Score, Eco-Score, Vegan, Alergeny */}
                <div className="flex flex-wrap gap-1.5 justify-center mb-4 text-[11px] font-bold">
                  {product.nutriScore && (
                    <span className="bg-emerald-950 text-emerald-300 border border-emerald-500 px-2 py-0.5 rounded">
                      Nutri-Score: {product.nutriScore}
                    </span>
                  )}
                  {product.ecoScore && (
                    <span className="bg-teal-950 text-teal-300 border border-teal-500 px-2 py-0.5 rounded">
                      Eco-Score: {product.ecoScore}
                    </span>
                  )}
                  {product.isVegan !== null && (
                    <span className="bg-lime-950 text-lime-300 border border-lime-500 px-2 py-0.5 rounded">
                      {product.isVegan ? "🌱 Wegański" : "🥩 Niewegański"}
                    </span>
                  )}
                  {product.allergens && (
                    <span className="bg-amber-950 text-amber-300 border border-amber-500 px-2 py-0.5 rounded">
                      ⚠️ Alergeny: {product.allergens}
                    </span>
                  )}
                </div>

                {/* Własna nazwa */}
                <div className="w-full mb-3">
                  <label className="text-[11px] text-slate-300 block mb-1">
                    {product.product_name === "Nieznany produkt" ? "Nadaj stałą nazwę:" : "Zmień nazwę dla wszystkich:"}
                  </label>
                  <input
                    type="text"
                    placeholder="Wpisz pełną nazwę towaru..."
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full bg-slate-700 border border-amber-500/50 p-2 rounded text-sm text-white outline-none"
                  />
                </div>

                {/* Statystyki społeczności */}
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

                {/* Formularz dodawania recenzji */}
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
                    <option value="Carrefour">Carrefour</option>
                    <option value="Żabka">Żabka</option>
                    <option value="Inny">Inny</option>
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
                        <span>{rev.is_recommended ? "👍 Poleca" : "👎 Odradzam"}</span>
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
