import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Camera, Plus, Home, Settings, ChevronLeft, Save, Trash2, 
  Loader2, BarChart3, Coffee, Sun, Moon, Cookie, Apple, 
  Droplets, Scale, TrendingUp, Activity, ScanLine
} from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { 
  getFirestore, collection, addDoc, query, onSnapshot, 
  deleteDoc, doc, setDoc, getDoc, Timestamp 
} from "firebase/firestore";

// --- ⚠️ PASTE YOUR KEYS HERE ⚠️ ---

// 1. Get API Key from: https://aistudio.google.com/
const GEMINI_API_KEY = "AIzaSyDRcpsB39McNLWSFqLVwx44B_YAComSeXk"; 

// 2. Get Config from: Firebase Console -> Project Settings -> General -> Your Apps
// It should look like the object below. Replace the whole block.
const firebaseConfig = {
  apiKey: "AIzaSyA4YGpAVnJZaVjL-Nut_pRhQxa3BLgWyow",
  authDomain: "calomad.firebaseapp.com",
  projectId: "calomad",
  storageBucket: "calomad.firebasestorage.app",
  messagingSenderId: "629752839466",
  appId: "1:629752839466:web:df82b96a8bd09b4160b253",
  measurementId: "G-8QC86YG3XS"
};

// --- App Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const GOOGLE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// --- Helper Functions ---
const isToday = (timestamp) => {
  if (!timestamp) return false;
  const date = timestamp.toDate();
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
};

const getMealTypeByTime = () => {
  const hour = new Date().getHours();
  if (hour < 11) return 'Breakfast';
  if (hour < 15) return 'Lunch';
  if (hour < 18) return 'Snack';
  return 'Dinner';
};

const getWeeklyData = (meals) => {
  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    d.setHours(0,0,0,0);
    const dayCalories = meals
      .filter(m => {
        if (!m.createdAt) return false;
        const mDate = m.createdAt.toDate();
        return mDate.getDate() === d.getDate() && 
               mDate.getMonth() === d.getMonth() && 
               mDate.getFullYear() === d.getFullYear();
      })
      .reduce((sum, m) => sum + (m.calories || 0), 0);
    days.push({
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      calories: dayCalories,
      isToday: i === 0
    });
  }
  return days;
};

const resizeImage = (file, maxWidth = 800) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]); 
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
};

const analyzeImageWithGemini = async (base64Image) => {
  if (GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
    alert("Please set your Gemini API Key in the code!");
    return { food_name: "API Key Missing", calories: 0 };
  }
  try {
    const response = await fetch(GOOGLE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: "Analyze this food image. Identify the food item. Estimate the calories, protein(g), carbs(g), and fat(g). Return ONLY raw JSON (no markdown) with keys: food_name, calories, protein, carbs, fat." },
            { inlineData: { mimeType: "image/jpeg", data: base64Image } }
          ]
        }]
      })
    });
    if (!response.ok) throw new Error('AI Service Unavailable');
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Could not identify food');
    return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch (error) {
    console.error("AI Error:", error);
    throw error;
  }
};

// --- Components ---
const CalorieRing = ({ eaten, goal }) => {
  const radius = 80;
  const stroke = 12;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const remaining = Math.max(goal - eaten, 0);
  const percent = Math.min((eaten / goal), 1);
  const strokeDashoffset = circumference - percent * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg height={radius * 2} width={radius * 2} className="rotate-[-90deg]">
        <circle stroke="#e2e8f0" strokeWidth={stroke} fill="transparent" r={normalizedRadius} cx={radius} cy={radius} />
        <circle
          stroke={eaten > goal ? "#ef4444" : "#2563eb"}
          strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.5s ease-in-out' }}
          strokeLinecap="round"
          fill="transparent"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold text-slate-800">{remaining}</span>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Left</span>
      </div>
    </div>
  );
};

const MacroBar = ({ label, value, total, color }) => {
  const percent = Math.min((value / total) * 100, 100);
  return (
    <div className="w-full mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium text-gray-500">{label}</span>
        <span className="font-bold text-gray-700">{Math.round(value)}g</span>
      </div>
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%`, transition: 'width 0.5s' }}></div>
      </div>
    </div>
  );
};

// --- Main App ---
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('home'); 
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dailyGoal, setDailyGoal] = useState(2200);
  const [currentWeight, setCurrentWeight] = useState(70);
  const [waterIntake, setWaterIntake] = useState(0);
  const [newMeal, setNewMeal] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '', type: 'Breakfast' });
  const [imagePreview, setImagePreview] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    // 1. Sign In (Anonymous)
    signInAnonymously(auth).catch(console.error);
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    // 2. Load Profile
    // Note: We removed the 'appId' wrapper to make it simpler for standard Firebase setups.
    // Data is stored under 'users/{uid}/...'
    const loadProfile = async () => {
      const docSnap = await getDoc(doc(db, 'users', user.uid, 'profile', 'settings'));
      if (docSnap.exists()) {
        const d = docSnap.data();
        if(d.dailyGoal) setDailyGoal(d.dailyGoal);
        if(d.weight) setCurrentWeight(d.weight);
        if(d.waterDate && isToday(d.waterDate)) setWaterIntake(d.water || 0);
      }
      setLoading(false);
    };
    loadProfile();

    // 3. Load Meals
    const q = query(collection(db, 'users', user.uid, 'meals'));
    const unsub = onSnapshot(q, (snap) => {
      const ms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      ms.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
      setMeals(ms);
    });
    return () => unsub();
  }, [user]);

  const updateProfile = async (updates) => {
    if(!user) return;
    await setDoc(doc(db, 'users', user.uid, 'profile', 'settings'), { ...updates, lastUpdated: Timestamp.now() }, { merge: true });
  };

  const todaysMeals = useMemo(() => meals.filter(m => isToday(m.createdAt)), [meals]);
  const stats = useMemo(() => todaysMeals.reduce((acc, c) => ({
    calories: acc.calories + (c.calories || 0),
    protein: acc.protein + (c.protein || 0),
    carbs: acc.carbs + (c.carbs || 0),
    fat: acc.fat + (c.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [todaysMeals]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (view !== 'add') {
      setNewMeal({ ...newMeal, type: getMealTypeByTime() });
      setView('add');
    }
    setImagePreview(URL.createObjectURL(file));
    setIsAnalyzing(true);
    try {
      const base64 = await resizeImage(file);
      const analysis = await analyzeImageWithGemini(base64);
      setNewMeal(prev => ({
        ...prev,
        name: analysis.food_name || 'Unknown',
        calories: Number(analysis.calories) || 0,
        protein: Number(analysis.protein) || 0,
        carbs: Number(analysis.carbs) || 0,
        fat: Number(analysis.fat) || 0
      }));
    } catch (err) { alert("AI Scan failed. Please enter manually."); }
    setIsAnalyzing(false);
  };

  const saveMeal = async () => {
    if (!newMeal.name) return;
    await addDoc(collection(db, 'users', user.uid, 'meals'), {
      ...newMeal,
      calories: Number(newMeal.calories),
      protein: Number(newMeal.protein),
      carbs: Number(newMeal.carbs),
      fat: Number(newMeal.fat),
      createdAt: Timestamp.now()
    });
    setNewMeal({ name: '', calories: '', protein: '', carbs: '', fat: '', type: 'Breakfast' });
    setImagePreview(null);
    setView('home');
  };

  const deleteMeal = async (id) => {
    if (confirm('Delete meal?')) await deleteDoc(doc(db, 'users', user.uid, 'meals', id));
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="h-screen w-full bg-[#f2f4f8] flex flex-col max-w-md mx-auto shadow-2xl overflow-hidden font-sans text-slate-800 relative">
      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" capture="environment" />

      {view === 'home' && (
        <>
          <header className="bg-white px-4 py-3 flex justify-between items-center shadow-sm sticky top-0 z-20">
            <div className="flex items-center gap-2 text-slate-800">
              <Apple size={20} className="text-blue-600 fill-current" />
              <h1 className="font-bold text-lg tracking-tight">CaloMad</h1>
            </div>
            <button onClick={() => fileInputRef.current?.click()} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 hover:bg-blue-100 transition">
              <ScanLine size={14} /> AI Scan
            </button>
          </header>
          <main className="flex-1 overflow-y-auto pb-24 scrollbar-hide">
            <div className="space-y-6 p-4 animate-in fade-in">
              <div className="bg-white p-6 shadow-sm rounded-3xl border border-slate-100">
                <div className="flex items-center gap-8 justify-center mb-6">
                  <div className="text-right">
                    <div className="text-2xl font-bold">{stats.calories}</div>
                    <div className="text-xs text-slate-400 font-bold uppercase">Eaten</div>
                  </div>
                  <CalorieRing eaten={stats.calories} goal={dailyGoal} />
                  <div className="text-left">
                     <div className="text-2xl font-bold">{Math.max(0, dailyGoal - stats.calories)}</div>
                     <div className="text-xs text-slate-400 font-bold uppercase">Left</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 px-2">
                   <MacroBar label="Carbs" value={stats.carbs} total={250} color="bg-purple-400" />
                   <MacroBar label="Protein" value={stats.protein} total={150} color="bg-green-500" />
                   <MacroBar label="Fat" value={stats.fat} total={80} color="bg-orange-400" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-white p-4 rounded-xl shadow-sm flex justify-between items-center">
                   <div><div className="text-xs text-slate-400 font-bold uppercase">Weight</div><div className="text-xl font-bold">{currentWeight} <span className="text-xs font-normal">kg</span></div></div>
                   <Scale className="text-blue-500 opacity-50" />
                 </div>
                 <div className="bg-white p-4 rounded-xl shadow-sm flex justify-between items-center">
                    <div><div className="text-xs text-slate-400 font-bold uppercase">Water</div><div className="text-xl font-bold">{waterIntake} <span className="text-xs font-normal">cups</span></div></div>
                    <button onClick={() => {
                        const n = waterIntake + 1;
                        setWaterIntake(n);
                        updateProfile({ water: n, waterDate: Timestamp.now() });
                    }} className="bg-blue-100 p-2 rounded-full text-blue-600"><Plus size={16}/></button>
                 </div>
              </div>

              {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map(type => {
                 const ms = window.mealsByType && window.mealsByType[type] ? window.mealsByType[type] : [];
                 const cals = ms.reduce((a,b)=>a+(b.calories||0),0);
                 const icons = { Breakfast: <Coffee size={18} className="text-orange-400"/>, Lunch: <Sun size={18} className="text-yellow-500"/>, Dinner: <Moon size={18} className="text-indigo-400"/>, Snack: <Cookie size={18} className="text-pink-400"/> };
                 
                 return (
                   <div key={type} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                      <div className="bg-slate-50 p-3 flex justify-between border-b border-slate-100">
                        <div className="flex items-center gap-2">{icons[type]} <span className="font-bold">{type}</span></div>
                        <div className="text-xs font-bold text-slate-400">{cals} kcal</div>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {ms.map(m => (
                          <div key={m.id} className="p-3 flex justify-between items-center">
                            <div><div className="font-medium text-sm">{m.name}</div><div className="text-[10px] text-slate-400">{m.calories} kcal</div></div>
                            <button onClick={() => deleteMeal(m.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>
                          </div>
                        ))}
                        <button onClick={() => { setNewMeal({...newMeal, type}); setView('add'); }} className="w-full p-3 text-sm font-bold text-blue-600 flex justify-center items-center gap-1 hover:bg-blue-50"><Plus size={16}/> Add Food</button>
                      </div>
                   </div>
                 );
              })}
            </div>
          </main>
        </>
      )}

      {view === 'add' && (
        <div className="bg-white min-h-full animate-in slide-in-from-right">
           <div className="flex items-center gap-2 p-4 border-b border-gray-100">
             <button onClick={() => setView('home')}><ChevronLeft /></button>
             <h2 className="font-bold text-lg">Add to {newMeal.type}</h2>
           </div>
           <div className="p-4 space-y-6">
              <div className="flex bg-gray-100 p-1 rounded-xl">
                {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map(t => (
                   <button key={t} onClick={() => setNewMeal({...newMeal, type: t})} className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${newMeal.type === t ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-400'}`}>{t}</button>
                ))}
              </div>
              <div onClick={() => fileInputRef.current?.click()} className={`h-48 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer overflow-hidden relative ${imagePreview ? 'border-blue-500 bg-black' : 'border-gray-200'}`}>
                 {imagePreview ? <><img src={imagePreview} className="w-full h-full object-contain opacity-80" />{isAnalyzing && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white"><Loader2 className="animate-spin mr-2"/> Analyzing...</div>}</> : <><ScanLine className="mb-2 text-blue-500"/><span className="text-sm font-bold text-gray-400">Tap to Scan</span></>}
              </div>
              <div className="bg-gray-50 p-4 rounded-xl">
                 <label className="text-xs font-bold text-gray-400 uppercase">Food Name</label>
                 <input type="text" value={newMeal.name} onChange={e => setNewMeal({...newMeal, name: e.target.value})} className="w-full bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none text-lg font-bold pb-2" placeholder="e.g. Apple"/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-gray-50 p-4 rounded-xl">
                    <label className="text-xs font-bold text-gray-400 uppercase">Calories</label>
                    <input type="number" value={newMeal.calories} onChange={e => setNewMeal({...newMeal, calories: e.target.value})} className="w-full bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none text-xl font-mono text-blue-600 font-bold pb-2" placeholder="0"/>
                 </div>
                 <div className="space-y-2">
                    <input type="number" placeholder="Prot (g)" value={newMeal.protein} onChange={e => setNewMeal({...newMeal, protein: e.target.value})} className="w-full p-2 bg-gray-50 rounded-lg text-sm border"/>
                    <input type="number" placeholder="Carbs (g)" value={newMeal.carbs} onChange={e => setNewMeal({...newMeal, carbs: e.target.value})} className="w-full p-2 bg-gray-50 rounded-lg text-sm border"/>
                    <input type="number" placeholder="Fat (g)" value={newMeal.fat} onChange={e => setNewMeal({...newMeal, fat: e.target.value})} className="w-full p-2 bg-gray-50 rounded-lg text-sm border"/>
                 </div>
              </div>
              <button onClick={saveMeal} disabled={!newMeal.name} className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 disabled:opacity-50">Save Entry</button>
           </div>
        </div>
      )}

      {view === 'report' && (
        <div className="bg-white min-h-full p-4 animate-in slide-in-from-right">
           <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setView('home')}><ChevronLeft /></button>
              <h2 className="font-bold text-xl">Analysis</h2>
           </div>
           <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-6">
              <div className="flex items-center gap-2 mb-6"><TrendingUp className="text-blue-500" size={20}/><h3 className="font-bold">History</h3></div>
              <div className="flex items-end justify-between h-40 gap-2">
                 {getWeeklyData(meals).map((d,i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                       <div className={`w-full rounded-t-md ${d.isToday ? 'bg-blue-500' : 'bg-blue-200'}`} style={{height: `${Math.max((d.calories/3000)*100, 10)}%`}}></div>
                       <span className="text-[10px] font-bold text-gray-400">{d.label}</span>
                    </div>
                 ))}
              </div>
           </div>
        </div>
      )}

      {view !== 'add' && (
        <nav className="bg-white border-t px-6 py-2 flex justify-between items-center z-30 pb-safe">
           <button onClick={() => setView('home')} className={`flex flex-col items-center p-2 ${view==='home'?'text-blue-600':'text-gray-400'}`}><Home size={24}/><span className="text-[10px] font-bold">Dash</span></button>
           <button onClick={() => {setNewMeal({name:'', calories:'', protein:'', carbs:'', fat:'', type: getMealTypeByTime()}); setView('add')}} className="bg-blue-600 text-white p-4 rounded-full shadow-lg shadow-blue-200 -mt-8 border-4 border-[#f2f4f8]"><Plus size={28}/></button>
           <button onClick={() => setView('report')} className={`flex flex-col items-center p-2 ${view==='report'?'text-blue-600':'text-gray-400'}`}><BarChart3 size={24}/><span className="text-[10px] font-bold">Stats</span></button>
        </nav>
      )}

      {/* Helpers required for render */}
      {(() => {
        // Just defining mealsByType here to keep code clean inside render
        const groups = { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
        todaysMeals.forEach(meal => { const t = meal.type||'Snack'; if(groups[t]) groups[t].push(meal); else groups['Snack'].push(meal); });
        window.mealsByType = groups;
        return null; 
      })()}
    </div>
  );
}