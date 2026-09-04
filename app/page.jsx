"use client";
import { useState, useEffect } from "react";
import Scanner from "../components/Scanner";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [ean, setEan] = useState(null);
  const [manualQuery, setManualQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [product, setProduct] = useState(null);
  const [customName, setCustomName] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [price, setPrice] = useState("");
  const [store, setStore] = useState("Biedronka");
  const [isRec, setIsRec] = useState(true);
  const [reviews, setReviews] = useState([]);
  const [recentScans, setRecentScans] = useState([]);
  const [shoppingList, setShoppingList] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("scan");
  const [userReviews, setUserReviews] = useState([]);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadUserData(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
      if (s?.user) loadUserData(s.user.id);
    });
    const saved = localStorage.getItem("recent_scans");
    if (saved) setRecentScans(JSON.parse(saved));
    return () => subscription.unsubscribe();
  }, []);

  const loadUserData = async (uid) => {
    const { data: revs } = await supabase.from("reviews").select("*").eq("user_id", uid).order("created_at", { ascending: false });
    if (revs) setUserReviews(revs);
    const { data: list } = await supabase.from("shopping_list").select("*").eq("user_id", uid);
    if (list) setShoppingList(list);
  };

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {}
  };

  const resetToScan = () => {
    setEan(null);
    setProduct(null);
    setSearchResults([]);
    setManualQuery("");
    setActiveTab("scan");
  };

  const toggleTorch = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const track = stream.getVideoTracks()[0];
      if (track.getCapabilities().torch) {
        await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
        setTorchOn(!torchOn);
      }
    } catch { alert("Flesz niedostępny w tej przeglądarce."); }
  };

  const fetchReviews = async (code) => {
    const { data } = await supabase.from("reviews").select("*").eq("ean", code).order("created_at", { ascending: false });
    if (data) setReviews(data);
  };

  const loadProductData = async (code) => {
    playBeep();
    if (navigator.vibrate) navigator.vibrate(80);
    setEan(code);
    setSearchResults([]);

    const { data: nameData } = await supabase.from("product_names").select("custom_name, custom_image").eq("ean", code).single();
    let pName = nameData?.custom_name || null;
    let img = nameData?.custom_image || "";
    let nutri = null, eco = null, palm = null, vegan = null, nutriments = null;

    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
      const d = await res.json();
      if (d.status === 1) {
        if (!pName) pName = d.product.product_name;
        if (!img) img = d.product.image_url || "";
        nutri = d.product.nutriscore_grade?.toUpperCase();
        eco = d.product.ecoscore_grade?.toUpperCase();
        palm = d.product.ingredients_from_palm_oil_n > 0;
        vegan = d.product.ingredients_analysis_tags?.includes("en:vegan");
        nutriments = d.product.nutriments;
      }
    } catch {}

    const finalName = pName || "Nieznany produkt";
    setProduct({
      name: finalName,
      img, nutri, eco, palm, vegan,
      kcal: nutriments?.["energy-kcal_100g"] || null,
      fat: nutriments?.fat_100g || null,
      carbs: nutriments?.carbohydrates_100g || null,
      proteins: nutriments?.proteins_100g || null
    });
    setCustomName(nameData?.custom_name || "");

    const updated = [{ ean: code, name: finalName, img }, ...recentScans.filter((i) => i.ean !== code)].slice(0, 6);
    setRecentScans(updated);
    localStorage.setItem("recent_scans", JSON.stringify(updated));
    await fetchReviews(code);
  };

  const handleSearch = async () => {
    if (!manualQuery.trim()) return;
    if (/^\d+$/.test(manualQuery.trim())) return loadProductData(manualQuery.trim());
    try {
      const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(manualQuery)}&search_simple=1&action=process&json=1&page_size=4`);
      const d = await res.json();
      setSearchResults(d.products || []);
    } catch {}
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !ean) return;
    setUploadingImg(true);
    const path = `${ean}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("product-images").upload(path, file);
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from("product-images").getPublicUrl(path);
      await supabase.from("product_names").upsert({ ean, custom_name: product.name, custom_image: publicUrl }, { onConflict: "ean" });
      setProduct((p) => ({ ...p, img: publicUrl }));
    }
    setUploadingImg(false);
  };

  const saveReview = async () => {
    setIsSubmitting(true);
    if (customName.trim()) {
      await supabase.from("product_names").upsert({ ean, custom_name: customName.trim() }, { onConflict: "ean" });
      setProduct((p) => ({ ...p, name: customName.trim() }));
    }
    if (user) await supabase.from("reviews").delete().eq("ean", ean).eq("user_id", user.id);

    await supabase.from("reviews").insert([{
      ean, rating, comment: comment.trim() || null,
      price: price ? parseFloat(price) : null, store,
      is_recommended: isRec, custom_name: customName.trim() || null, user_id: user?.id || null
    }]);

    setIsSubmitting(false);
    alert("Zapisano recenzję!");
    if (user) loadUserData(user.id);
    await fetchReviews(ean);
  };

  const deleteReview = async (id) => {
    if (!confirm("Usunąć ocenę?")) return;
    await supabase.from("reviews").delete().eq("id", id);
    if (user) loadUserData(user.id);
    if (ean) fetchReviews(ean);
  };

  const toggleShoppingList = async (code, name) => {
    if (!user) return alert("Zaloguj się, aby tworzyć listę!");
    const exists = shoppingList.find((i) => i.ean === code);
    if (exists) await supabase.from("shopping_list").delete().eq("id", exists.id);
    else await supabase.from("shopping_list").insert([{ user_id: user.id, ean: code, name }]);
    loadUserData(user.id);
  };

  const exportCSV = () => {
    let csv = "EAN,Nazwa,Ocena,Cena,Data\n";
    userReviews.forEach((r) => {
      csv += `"${r.ean}","${r.custom_name || ""}","${r.rating}","${r.price || ""}","${r.created_at}"\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "moje_oceny.csv";
    link.click();
  };

  const avgRating = reviews.length ? (reviews.reduce((a, b) => a + b.rating, 0) / reviews.length).toFixed(1) : null;
  const prices = reviews.filter((r) => r.price).map((r) => ({ p: r.price, s: r.store }));
  const cheapest = prices.length ? prices.reduce((min, cur) => cur.p < min.p ? cur : min, prices[0]) : null;

  return (
    <main className="min-h-screen p-3 flex flex-col items-center bg-slate-950 text-slate-100 font-sans">
      {/* GÓRNY PASEK Z NAWIGACJĄ */}
      <header className="w-full max-w-md flex justify-between items-center mb-3 pb-2 border-b border-slate-800 text-xs">
        <div className="flex gap-1.5 items-center">
          {ean ? (
            <button onClick={resetToScan} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow">
              🔍 + Nowy skan
            </button>
          ) : (
            <button onClick={() => setActiveTab("scan")} className={`px-3 py-1.5 rounded-lg font-bold ${activeTab === "scan" ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400"}`}>
              📷 Skaner
            </button>
          )}
          <button onClick={() => setActiveTab("list")} className={`px-2.5 py-1.5 rounded-lg font-bold ${activeTab === "list" ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400"}`}>
            🛒 ({shoppingList.length})
          </button>
          <button onClick={() => setActiveTab("profile")} className={`px-2.5 py-1.5 rounded-lg font-bold ${activeTab === "profile" ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400"}`}>
            👤 Profil
          </button>
        </div>
        {user && <button onClick={() => supabase.auth.signOut().then(() => setUser(null))} className="text-rose-400">Wyloguj</button>}
      </header>

      {/* LISTA ZAKUPÓW */}
      {activeTab === "list" && (
        <div className="w-full max-w-md bg-slate-900 p-4 rounded-xl border border-slate-800 text-xs">
          <h2 className="font-bold text-sm mb-3">Lista zakupowa</h2>
          {shoppingList.length === 0 ? <p className="text-slate-500">Brak artykułów na liście.</p> : shoppingList.map((i) => (
            <div key={i.id} className="flex justify-between items-center bg-slate-800/80 p-2.5 rounded-lg border border-slate-700 mb-2">
              <div><p className="font-bold text-white">{i.name}</p><p className="text-[10px] text-slate-500">EAN: {i.ean}</p></div>
              <button onClick={() => toggleShoppingList(i.ean, i.name)} className="text-emerald-400 font-bold">Kupione ✓</button>
            </div>
          ))}
        </div>
      )}

      {/* PROFIL UŻYTKOWNIKA */}
      {activeTab === "profile" && (
        <div className="w-full max-w-md bg-slate-900 p-4 rounded-xl border border-slate-800 text-xs">
          {!user ? (
            <form onSubmit={async (e) => {
              e.preventDefault(); setAuthMsg("Wysyłanie...");
              const { error } = await supabase.auth.signInWithOtp({ email: authEmail, options: { emailRedirectTo: window.location.origin } });
              setAuthMsg(error ? error.message : "Sprawdź skrzynkę e-mail!");
            }} className="flex flex-col gap-2">
              <p className="font-bold">Logowanie Magic Link:</p>
              <input type="email" placeholder="email@domena.pl" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="bg-slate-800 border border-slate-700 p-2 rounded text-white" />
              <button className="bg-blue-600 text-white font-bold py-1.5 rounded">Zaloguj</button>
              {authMsg && <p className="text-amber-400">{authMsg}</p>}
            </form>
          ) : (
            <div>
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h3 className="font-bold text-sm text-white">Twój Profil</h3>
                  <p className="text-[10px] text-slate-400">{user.email}</p>
                </div>
                <button onClick={exportCSV} className="bg-emerald-600 px-2.5 py-1 rounded text-white font-bold text-[11px]">Pobierz CSV</button>
              </div>

              {/* STATYSTYKI KONTA */}
              <div className="grid grid-cols-3 gap-2 bg-slate-800/60 p-2.5 rounded-lg border border-slate-700 text-center mb-4">
                <div><span className="text-slate-400 block text-[10px]">Ocenione</span><b className="text-blue-400 text-sm">{userReviews.length}</b></div>
                <div><span className="text-slate-400 block text-[10px]">Śr. gwiazdek</span><b className="text-amber-400 text-sm">{(userReviews.reduce((a,b)=>a+b.rating,0)/(userReviews.length||1)).toFixed(1)}★</b></div>
                <div><span className="text-slate-400 block text-[10px]">Wydano</span><b className="text-emerald-400 text-sm">{userReviews.reduce((a,b)=>a+(b.price||0),0).toFixed(0)} zł</b></div>
              </div>

              <p className="font-bold text-slate-300 mb-2">Twoje recenzje:</p>
              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                {userReviews.map((r) => (
                  <div key={r.id} className="bg-slate-800/80 p-2 rounded-lg border border-slate-700 flex justify-between items-start">
                    <div>
                      <p className="font-bold text-white">{r.custom_name || `EAN: ${r.ean}`}</p>
                      <p className="text-amber-400">{"★".repeat(r.rating)} <span className="text-slate-400 text-[10px]">{r.price && `(${r.price} zł)`}</span></p>
                      {r.comment && <p className="text-slate-300 mt-0.5">{r.comment}</p>}
                    </div>
                    <button onClick={() => deleteReview(r.id)} className="text-rose-400 text-[10px] font-bold">Usuń</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SKANER I KAFELKOWA HISTORIA */}
      {activeTab === "scan" && (
        <>
          {!ean && (
            <div className="w-full max-w-md flex flex-col gap-3">
              <div className="relative">
                <Scanner onScan={loadProductData} />
                <button onClick={toggleTorch} className="absolute top-2 right-2 bg-black/70 border border-white/20 text-[11px] px-2 py-0.5 rounded text-white">
                  🔦 {torchOn ? "Flesz wł." : "Flesz wył."}
                </button>
              </div>

              {/* SZUKAJ PO EAN LUB NAZWIE */}
              <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 flex gap-2">
                <input type="text" placeholder="Wpisz kod EAN lub nazwę..." value={manualQuery} onChange={(e) => setManualQuery(e.target.value)} className="bg-slate-800 border border-slate-700 p-1.5 rounded text-xs flex-1 text-white outline-none" />
                <button onClick={handleSearch} className="bg-blue-600 px-3 py-1.5 rounded text-xs font-bold text-white">Szukaj</button>
              </div>

              {/* WYNIKI WYSZUKIWANIA TEKSTOWEGO */}
              {searchResults.length > 0 && (
                <div className="bg-slate-900 p-2 rounded-xl border border-slate-800 flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Wyniki wyszukiwania:</span>
                  {searchResults.map((p) => (
                    <button key={p.code} onClick={() => loadProductData(p.code)} className="flex items-center gap-2 p-1.5 bg-slate-800 rounded text-left">
                      {p.image_small_url && <img src={p.image_small_url} alt="" className="w-6 h-6 object-contain" />}
                      <span className="text-xs text-white truncate">{p.product_name || p.code}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* KAFELKOWA HISTORIA OSTATNICH SKANÓW */}
              {recentScans.length > 0 && (
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-xs">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block mb-2">Ostatnio sprawdzane:</span>
                  <div className="grid grid-cols-2 gap-2">
                    {recentScans.map((s) => (
                      <button key={s.ean} onClick={() => loadProductData(s.ean)} className="flex items-center gap-2 p-2 bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 rounded-lg text-left transition-colors">
                        {s.img ? <img src={s.img} alt="" className="w-9 h-9 object-contain bg-white rounded p-0.5" /> : <div className="w-9 h-9 bg-slate-700 rounded flex items-center justify-center text-xs">📦</div>}
                        <div className="overflow-hidden">
                          <p className="font-bold text-white text-[11px] truncate">{s.name}</p>
                          <p className="text-[9px] text-slate-400 font-mono truncate">{s.ean}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* KARTA ZESKANOWANEGO PRODUKTU */}
          {product && (
            <div className="w-full max-w-md flex flex-col gap-3">
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col items-center text-xs">
                {product.img ? (
                  <img src={product.img} alt="" className="w-24 h-24 object-contain mb-2 bg-white rounded p-1" />
                ) : (
                  <label className="w-24 h-24 mb-2 bg-slate-800 border-2 border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center cursor-pointer text-slate-400 hover:text-blue-400">
                    <span className="text-xl">📷</span>
                    <span className="text-[9px] text-center font-bold mt-1">{uploadingImg ? "Wgrywanie..." : "Dodaj zdjęcie"}</span>
                    <input type="file" accept="image/*" capture="environment" onChange={uploadPhoto} className="hidden" />
                  </label>
                )}

                <h2 className="text-base font-bold text-center text-white mb-1">{product.name}</h2>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-slate-500 text-[10px] font-mono">{ean}</span>
                  <button onClick={() => { navigator.clipboard.writeText(ean); alert("Skopiowano EAN!"); }} className="text-blue-400 text-[10px]">📋 Kopiuj</button>
                </div>

                {/* ETYKIETY */}
                <div className="flex flex-wrap gap-1 justify-center mb-3">
                  {product.nutri && <span className="bg-emerald-950 text-emerald-300 border border-emerald-600 px-1.5 py-0.5 rounded font-bold">Nutri: {product.nutri}</span>}
                  {product.eco && <span className="bg-teal-950 text-teal-300 border border-teal-600 px-1.5 py-0.5 rounded font-bold">Eco: {product.eco}</span>}
                  {product.vegan !== null && <span className="bg-lime-950 text-lime-300 border border-lime-600 px-1.5 py-0.5 rounded font-bold">{product.vegan ? "🌱 Wegan" : "🥩 Niewegan"}</span>}
                  {product.palm && <span className="bg-amber-950 text-amber-300 border border-amber-600 px-1.5 py-0.5 rounded font-bold">⚠️ Olej palmowy</span>}
                </div>

                {/* MAKRO */}
                {product.kcal && (
                  <div className="grid grid-cols-4 gap-1 w-full bg-slate-800/80 p-2 rounded-lg text-center mb-3 border border-slate-700">
                    <div><span className="text-[10px] text-slate-400 block">Kcal</span><b className="text-white">{product.kcal}</b></div>
                    <div><span className="text-[10px] text-slate-400 block">Tłuszcz</span><b className="text-white">{product.fat}g</b></div>
                    <div><span className="text-[10px] text-slate-400 block">Węgle</span><b className="text-white">{product.carbs}g</b></div>
                    <div><span className="text-[10px] text-slate-400 block">Białko</span><b className="text-white">{product.proteins}g</b></div>
                  </div>
                )}

                {cheapest && (
                  <div className="w-full bg-emerald-950/40 border border-emerald-800/60 p-1.5 rounded text-center mb-2 text-[11px] text-emerald-300">
                    🏷️ Najtaniej: <b>{cheapest.p} zł</b> w <b>{cheapest.s}</b>
                  </div>
                )}

                <input type="text" placeholder="Zmień/nadaj stałą nazwę..." value={customName} onChange={(e) => setCustomName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded text-xs text-white mb-3 outline-none" />

                <div className="flex gap-2 mb-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setRating(n)} className={`w-8 h-8 rounded-full text-base ${rating >= n ? "bg-amber-400 text-black font-bold" : "bg-slate-800 text-slate-500"}`}>★</button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-1.5 w-full mb-2">
                  <input type="number" step="0.01" placeholder="Cena zł" value={price} onChange={(e) => setPrice(e.target.value)} className="bg-slate-800 border border-slate-700 p-1.5 rounded text-xs text-white" />
                  <select value={store} onChange={(e) => setStore(e.target.value)} className="bg-slate-800 border border-slate-700 p-1.5 rounded text-xs text-white">
                    <option value="Biedronka">Biedronka</option><option value="Lidl">Lidl</option><option value="Dino">Dino</option><option value="Żabka">Żabka</option><option value="Kaufland">Kaufland</option>
                  </select>
                  <button type="button" onClick={() => setIsRec(!isRec)} className={`rounded font-bold text-[10px] border ${isRec ? "bg-emerald-950 border-emerald-600 text-emerald-300" : "bg-rose-950 border-rose-600 text-rose-300"}`}>
                    {isRec ? "👍 Polecam" : "👎 Odradzam"}
                  </button>
                </div>

                <textarea placeholder="Komentarz..." value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded text-xs text-white mb-2" />
                <button onClick={saveReview} disabled={isSubmitting} className="w-full bg-blue-600 text-white font-bold py-2 rounded-lg text-xs">
                  {isSubmitting ? "Zapis..." : "Zapisz recenzję"}
                </button>

                <div className="flex justify-between w-full mt-2 text-[11px]">
                  <button onClick={() => toggleShoppingList(ean, product.name)} className="text-amber-400 font-bold">+ Lista zakupów</button>
                  <button onClick={resetToScan} className="text-emerald-400 font-bold">🔍 Skanuj następny</button>
                </div>
              </div>

              {/* OPINIE */}
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-xs">
                <span className="font-bold text-white block mb-2">Opinie ({reviews.length}) • Średnia: {avgRating || "-"}★</span>
                {reviews.map((r) => (
                  <div key={r.id} className="border-b border-slate-800 py-1.5 last:border-0">
                    <span className="text-amber-400 font-bold">{"★".repeat(r.rating)}</span>
                    <span className="text-[10px] text-slate-400 block">{r.price && `${r.price} zł (${r.store}) • `}{r.is_recommended ? "Poleca" : "Odradza"}</span>
                    {r.comment && <p className="text-slate-200 mt-1">{r.comment}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
