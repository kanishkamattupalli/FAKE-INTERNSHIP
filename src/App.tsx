import { useState, useRef, useEffect } from "react";
import { GoogleGenAI, Type } from "@google/genai";
import { 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  Upload, 
  X, 
  Search, 
  Info,
  ExternalLink,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Loader2,
  LayoutDashboard,
  History,
  TrendingUp,
  Clock,
  ArrowRight,
  LogIn,
  LogOut,
  User as UserIcon,
  Sun,
  Moon,
  BookOpen,
  Users,
  ShieldQuestion,
  CheckCircle2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { auth, googleProvider, db } from "./lib/firebase";
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  type User 
} from "firebase/auth";
import { collection, addDoc, query, orderBy, limit, getDocs, onSnapshot, serverTimestamp } from "firebase/firestore";

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AnalysisResult {
  detectionResult: "REAL" | "FAKE";
  confidenceLevel: number;
  reasons: string[];
  redFlags: string[];
  suggestions: string[];
}

interface ScanHistoryItem extends AnalysisResult {
  id: number;
  created_at: string;
}

interface Stats {
  total: number;
  fake: number;
  real: number;
  recentActivity: { detection_result: string; count: number }[];
}

export default function App() {
  const [view, setView] = useState<"scanner" | "dashboard" | "community" | "encyclopedia">("scanner");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("theme") as "light" | "dark") || "light";
    }
    return "light";
  });
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [inputText, setInputText] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (view === "dashboard") {
      fetchStats();
      // Use Firestore for real-time history updates
      const q = query(collection(db, "scans"), orderBy("created_at", "desc"), limit(50));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const historyData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          created_at: doc.data().created_at?.toDate()?.toISOString() || new Date().toISOString()
        })) as any;
        setHistory(historyData);
      });
      return () => unsubscribe();
    }
  }, [view]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Login failed:", err);
      let errorMessage = err.message || "Please try again.";
      if (err.code === "auth/configuration-not-found") {
        errorMessage = "Google Sign-In is not enabled. Please go to your Firebase Console > Authentication > Sign-in method and enable Google. Also, ensure this app's domain is added to 'Authorized domains'.";
      } else if (err.code === "auth/popup-blocked") {
        errorMessage = "The login popup was blocked by your browser. Please allow popups for this site and try again.";
      }
      setError(errorMessage);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error("Auth failed:", err);
      let errorMessage = err.message;
      if (err.code === "auth/email-already-in-use") {
        errorMessage = "This email is already registered. Try logging in instead.";
      } else if (err.code === "auth/weak-password") {
        errorMessage = "Password should be at least 6 characters.";
      } else if (err.code === "auth/invalid-email") {
        errorMessage = "Please enter a valid email address.";
      } else if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        errorMessage = "Invalid email or password.";
      }
      setError(errorMessage);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const fetchStats = async () => {
    setIsLoadingStats(true);
    try {
      // We can calculate stats from Firestore or keep using the backend
      // For simplicity and "linking", let's use Firestore for the global count
      const querySnapshot = await getDocs(collection(db, "scans"));
      const allScans = querySnapshot.docs.map(d => d.data());
      
      setStats({
        total: allScans.length,
        fake: allScans.filter(s => s.detectionResult === "FAKE").length,
        real: allScans.filter(s => s.detectionResult === "REAL").length,
        recentActivity: [] // Optional
      });
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const fetchHistory = async () => {
    // Handled by onSnapshot
  };

  const saveScanResult = async (scanResult: AnalysisResult) => {
    try {
      // Save to Firestore
      await addDoc(collection(db, "scans"), {
        ...scanResult,
        userId: user?.uid || "anonymous",
        userEmail: user?.email || "anonymous",
        created_at: serverTimestamp()
      });

      // Also save to local SQLite for redundancy (optional)
      await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scanResult),
      });
    } catch (err) {
      console.error("Failed to save scan result:", err);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearInputs = () => {
    setInputText("");
    setSelectedImage(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const analyzePoster = async () => {
    if (!inputText && !selectedImage) {
      setError("Please provide either content text or an image.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const prompt = `
        You are InternGuard AI, an elite security system designed to protect students from fraudulent internship offers and fake certificates.
        Analyze the provided content (text and/or image) and determine whether it is REAL or FAKE.
        
        For Internship Posters, check:
        1. Language patterns: Grammar mistakes, exaggerated promises (e.g., "Earn ₹50,000 in 1 week").
        2. Contact details: Personal WhatsApp numbers, Gmail/Yahoo IDs instead of official company domains.
        3. Company information: Missing website, fake company name, no LinkedIn presence.
        4. Payment requests: Asking for registration fees, security deposits, or training fees.
        5. Poster design quality: Copied logos, low-quality images, unrealistic offers.
        
        For Certificates, check:
        1. Verification links/QR codes: If present, do they point to a legitimate domain?
        2. Signatures and seals: Look for generic, low-resolution, or mismatched fonts.
        3. Issuer reputation: Is the organization known for issuing such certificates?
        4. Formatting: Alignment issues, font inconsistency, or spelling errors in official titles.
        5. Certificate ID: Presence of a unique, verifiable identifier.
        
        Return the result in JSON format with the following structure:
        {
          "detectionResult": "REAL" | "FAKE",
          "confidenceLevel": number (0-100),
          "reasons": ["reason 1", "reason 2", ...],
          "redFlags": ["flag 1", "flag 2", ...],
          "suggestions": ["suggestion 1", "suggestion 2", ...]
        }
      `;

      let response;
      if (selectedImage) {
        const base64Data = selectedImage.split(",")[1];
        response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              { text: prompt + (inputText ? `\n\nAdditional context from text: ${inputText}` : "") },
              { inlineData: { mimeType: "image/png", data: base64Data } }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                detectionResult: { type: Type.STRING, enum: ["REAL", "FAKE"] },
                confidenceLevel: { type: Type.NUMBER },
                reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
                redFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
                suggestions: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["detectionResult", "confidenceLevel", "reasons", "redFlags", "suggestions"]
            }
          }
        });
      } else {
        response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Poster Content to Analyze:\n${inputText}\n\n${prompt}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                detectionResult: { type: Type.STRING, enum: ["REAL", "FAKE"] },
                confidenceLevel: { type: Type.NUMBER },
                reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
                redFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
                suggestions: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["detectionResult", "confidenceLevel", "reasons", "redFlags", "suggestions"]
            }
          }
        });
      }

      const parsedResult = JSON.parse(response.text);
      setResult(parsedResult);
      saveScanResult(parsedResult);
    } catch (err) {
      console.error("Analysis failed:", err);
      setError("Failed to analyze the poster. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300 font-sans selection:bg-indigo-100">
      <AnimatePresence mode="wait">
        {!user && !isGuest && view === "scanner" ? (
          <motion.div 
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-white dark:bg-slate-950"
          >
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-50 dark:bg-indigo-900/10 rounded-full blur-[120px]" />
              <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-50 dark:bg-emerald-900/10 rounded-full blur-[120px]" />
            </div>

            <div className="relative w-full max-w-md p-8 text-center">
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-indigo-200 mx-auto mb-8"
              >
                <ShieldAlert size={40} />
              </motion.div>
              
              <motion.h1 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-4xl font-black tracking-tight text-slate-900 mb-4"
              >
                InternGuard AI
              </motion.h1>
              
              <motion.p 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-slate-500 mb-10 leading-relaxed"
              >
                The world's first AI-powered shield against internship scams and fraudulent certificates. Secure your future today.
              </motion.p>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="space-y-4"
              >
                <form onSubmit={handleEmailAuth} className="space-y-3 text-left">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
                    <input 
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Password</label>
                    <input 
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-[0.98]"
                  >
                    {isSignUp ? "Create Account" : "Sign In"}
                  </button>
                </form>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                  <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold text-slate-300 bg-white px-4">OR</div>
                </div>

                <button 
                  onClick={handleLogin}
                  className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 text-slate-700 py-3.5 rounded-xl font-bold hover:bg-slate-50 transition-all active:scale-[0.98]"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                  Continue with Google
                </button>
                
                {error && (
                  <p className="text-rose-500 text-xs font-medium mt-2">{error}</p>
                )}

                <div className="flex flex-col gap-2 pt-2">
                  <button 
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="w-full py-2 text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-all"
                  >
                    {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Create one"}
                  </button>
                  <button 
                    onClick={() => setIsGuest(true)}
                    className="w-full py-2 text-sm font-bold text-slate-400 hover:text-slate-600 transition-all"
                  >
                    Continue as Guest
                  </button>
                  <button 
                    onClick={() => {
                      const helpMsg = `To enable Auth methods:\n1. Go to Firebase Console > Authentication > Sign-in method.\n2. Enable 'Email/Password' and 'Google'.\n3. Go to 'Settings' > 'Authorized domains' and add:\n   - ais-dev-765fifrve4p2nrv6nilfct-532621768125.asia-east1.run.app\n   - ais-pre-765fifrve4p2nrv6nilfct-532621768125.asia-east1.run.app`;
                      alert(helpMsg);
                    }}
                    className="text-[10px] font-bold text-slate-300 hover:text-slate-400 underline underline-offset-4"
                  >
                    Setup Help
                  </button>
                </div>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="mt-12 pt-8 border-t border-slate-100 flex justify-center gap-12"
              >
                <div className="text-center">
                  <p className="text-2xl font-black text-slate-900">15k+</p>
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Scams Blocked</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-slate-900">99.8%</p>
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Accuracy</p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 backdrop-blur-md bg-white/80 dark:bg-slate-900/80">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setView("scanner")}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 dark:shadow-none group-hover:scale-105 transition-transform">
              <ShieldAlert size={24} />
            </div>
            <div className="hidden sm:block">
              <h1 className="font-black text-xl tracking-tight text-slate-900 dark:text-white">InternGuard <span className="text-indigo-600">AI</span></h1>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Scam Detection Engine</p>
            </div>
          </div>
          
          <nav className="hidden sm:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button 
              onClick={() => setView("scanner")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                view === "scanner" ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <Search size={16} />
              Scanner
            </button>
            <button 
              onClick={() => setView("dashboard")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                view === "dashboard" ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <LayoutDashboard size={16} />
              Dashboard
            </button>
            <button 
              onClick={() => setView("community")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                view === "community" ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <Users size={16} />
              Community
            </button>
            <button 
              onClick={() => setView("encyclopedia")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                view === "encyclopedia" ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <BookOpen size={16} />
              Encyclopedia
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400 transition-all"
              title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
            >
              {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
            </button>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden md:block text-right">
                  <p className="text-xs font-bold text-slate-900">{user.displayName}</p>
                  <p className="text-[10px] text-slate-400">{user.email}</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400 transition-all"
                  title="Sign Out"
                >
                  <LogOut size={18} />
                </button>
                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 overflow-hidden">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-indigo-600">
                      <UserIcon size={16} />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-all text-xs font-semibold"
              >
                <LogIn size={16} />
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        <AnimatePresence mode="wait">
          {view === "scanner" ? (
            <motion.div 
              key="scanner"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
              {/* Input Section */}
              <div className="lg:col-span-5 space-y-6">
                <section className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 mb-4">
                    <Search size={18} className="text-indigo-600 dark:text-indigo-400" />
                    <h2 className="font-semibold text-slate-800 dark:text-slate-100">AI Scanner</h2>
                  </div>

                  <div className="space-y-4">
                    {/* Text Input */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Content to Verify</label>
                      <textarea 
                        className="w-full h-32 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm resize-none text-slate-900 dark:text-slate-100"
                        placeholder="Paste the internship description, certificate details, or any suspicious content here..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                      />
                    </div>

                    {/* Image Upload */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Or Upload Image/Certificate</label>
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                          "relative border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all group",
                          selectedImage 
                            ? "border-indigo-400 bg-indigo-50/30 dark:bg-indigo-900/20" 
                            : "border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        )}
                      >
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          className="hidden" 
                          accept="image/*" 
                          onChange={handleImageUpload}
                        />
                        
                        {selectedImage ? (
                          <div className="relative w-full aspect-video rounded-lg overflow-hidden shadow-sm">
                            <img src={selectedImage} alt="Selected" className="w-full h-full object-contain" />
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedImage(null);
                                if (fileInputRef.current) fileInputRef.current.value = "";
                              }}
                              className="absolute top-2 right-2 p-1 bg-white/90 rounded-full text-slate-600 hover:text-rose-600 shadow-sm transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-all mb-3">
                              <Upload size={20} />
                            </div>
                            <p className="text-sm font-medium text-slate-600">Click to upload image</p>
                            <p className="text-xs text-slate-400 mt-1">PNG, JPG up to 5MB</p>
                          </>
                        )}
                      </div>
                    </div>

                    {error && (
                      <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30 rounded-lg flex items-center gap-2 text-rose-600 dark:text-rose-400 text-xs font-medium">
                        <AlertTriangle size={14} />
                        {error}
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <button 
                        onClick={analyzePoster}
                        disabled={isAnalyzing || (!inputText && !selectedImage)}
                        className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-2"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <ShieldCheck size={18} />
                            Run Detection
                          </>
                        )}
                      </button>
                      <button 
                        onClick={clearInputs}
                        className="px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                </section>

                {/* Quick Tips */}
                <section className="bg-indigo-900 rounded-2xl p-6 text-white shadow-xl shadow-indigo-100">
                  <div className="flex items-center gap-2 mb-4">
                    <Info size={18} className="text-indigo-300" />
                    <h3 className="font-semibold">Common Red Flags</h3>
                  </div>
                  <ul className="space-y-3 text-sm text-indigo-100/80">
                    <li className="flex gap-2">
                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                      <span>Asking for "Registration Fees" or "Security Deposits"</span>
                    </li>
                    <li className="flex gap-2">
                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                      <span>Contact emails ending in @gmail.com or @outlook.com</span>
                    </li>
                    <li className="flex gap-2">
                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                      <span>Unrealistic stipends (e.g., ₹50k for data entry)</span>
                    </li>
                  </ul>
                </section>
              </div>

              {/* Results Section */}
              <div className="lg:col-span-7">
                <AnimatePresence mode="wait">
                  {result ? (
                    <motion.div 
                      key="result"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="space-y-6"
                    >
                      {/* Status Card */}
                      <div className={cn(
                        "rounded-2xl p-8 border shadow-sm relative overflow-hidden",
                        result.detectionResult === "FAKE" 
                          ? "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100" 
                          : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100"
                      )}>
                        {/* Background Pattern */}
                        <div className="absolute top-0 right-0 opacity-10 transform translate-x-1/4 -translate-y-1/4">
                          {result.detectionResult === "FAKE" ? <ShieldAlert size={200} /> : <ShieldCheck size={200} />}
                        </div>

                        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                          <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest opacity-60">Detection Result</p>
                            <h2 className="text-4xl font-black tracking-tight flex items-center gap-3">
                              {result.detectionResult}
                              {result.detectionResult === "FAKE" ? <ShieldAlert size={32} /> : <ShieldCheck size={32} />}
                            </h2>
                            <p className="text-sm font-medium opacity-80 max-w-md">
                              {result.detectionResult === "FAKE" 
                                ? "This internship shows multiple characteristics of a scam. Proceed with extreme caution."
                                : "This internship appears to be legitimate based on our analysis."}
                            </p>
                          </div>
                          
                          <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl p-4 border border-white/50 dark:border-slate-700/50 flex flex-col items-center justify-center min-w-[140px]">
                            <p className="text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1">Confidence</p>
                            <div className="text-3xl font-bold">{result.confidenceLevel}%</div>
                            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mt-2 overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${result.confidenceLevel}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className={cn(
                                  "h-full rounded-full",
                                  result.detectionResult === "FAKE" ? "bg-rose-500" : "bg-emerald-500"
                                )}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Reasons */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
                          <div className="flex items-center gap-2 mb-4">
                            <FileText size={18} className="text-indigo-600 dark:text-indigo-400" />
                            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Analysis Summary</h3>
                          </div>
                          <ul className="space-y-3">
                            {result.reasons.map((reason, i) => (
                              <li key={i} className="flex gap-3 text-sm text-slate-600 dark:text-slate-400">
                                <ChevronRight size={16} className="shrink-0 mt-0.5 text-slate-300 dark:text-slate-700" />
                                {reason}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Red Flags */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
                          <div className="flex items-center gap-2 mb-4">
                            <AlertTriangle size={18} className="text-rose-500 dark:text-rose-400" />
                            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Red Flags Identified</h3>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {result.redFlags.map((flag, i) => (
                              <span key={i} className="px-3 py-1 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-full text-[11px] font-bold border border-rose-100 dark:border-rose-900/30">
                                {flag}
                              </span>
                            ))}
                            {result.redFlags.length === 0 && (
                              <p className="text-sm text-slate-400 italic">No major red flags detected.</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Suggestions */}
                      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                          <ExternalLink size={18} className="text-indigo-600 dark:text-indigo-400" />
                          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Next Steps & Verification</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {result.suggestions.map((suggestion, i) => (
                            <div key={i} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-400 flex gap-3">
                              <div className="w-6 h-6 bg-white dark:bg-slate-700 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-[10px] font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                                {i + 1}
                              </div>
                              {suggestion}
                            </div>
                          ))}
                        </div>
                      </div>

                    </motion.div>
                  ) : isAnalyzing ? (
                    <div className="h-full min-h-[400px] flex flex-col items-center justify-center space-y-6 text-center">
                      <div className="relative">
                        <div className="w-24 h-24 border-4 border-indigo-100 dark:border-indigo-900/30 rounded-full animate-pulse" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Loader2 size={40} className="text-indigo-600 dark:text-indigo-400 animate-spin" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Scanning for Scams</h3>
                        <p className="text-slate-500 dark:text-slate-400 max-w-xs mx-auto">Our AI is analyzing language patterns, contact details, and company metadata...</p>
                      </div>
                      <div className="flex gap-2">
                        <div className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-bounce" />
                      </div>
                    </div>
                  ) : (
                    <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white/50 dark:bg-slate-900/50">
                      <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center text-slate-300 dark:text-slate-700 mb-6">
                        <ImageIcon size={40} />
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Ready to Scan</h3>
                      <p className="text-slate-500 dark:text-slate-400 max-w-sm">
                        Upload an image or paste the text of an internship poster to start the AI analysis.
                      </p>
                      <div className="mt-8 grid grid-cols-2 gap-4 w-full max-w-md">
                        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm text-left">
                          <ShieldCheck size={20} className="text-emerald-500 mb-2" />
                          <p className="text-xs font-bold text-slate-400 uppercase mb-1">Step 1</p>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Provide Poster Content</p>
                        </div>
                        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm text-left">
                          <ShieldAlert size={20} className="text-indigo-500 mb-2" />
                          <p className="text-xs font-bold text-slate-400 uppercase mb-1">Step 2</p>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Get Risk Assessment</p>
                        </div>
                      </div>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : view === "dashboard" ? (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              {/* Stats Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                      <TrendingUp size={20} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Scans</span>
                  </div>
                  <div className="text-3xl font-bold text-slate-900 dark:text-white">{stats?.total || 0}</div>
                  <p className="text-xs text-slate-500 mt-1">Global community scans</p>
                </div>
                
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 bg-rose-50 dark:bg-rose-900/20 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-400">
                      <ShieldAlert size={20} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scams Detected</span>
                  </div>
                  <div className="text-3xl font-bold text-rose-600 dark:text-rose-400">{stats?.fake || 0}</div>
                  <p className="text-xs text-slate-500 mt-1">Fraudulent offers blocked</p>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck size={20} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Legit Internships</span>
                  </div>
                  <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats?.real || 0}</div>
                  <p className="text-xs text-slate-500 mt-1">Verified opportunities</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent History */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History size={18} className="text-indigo-600 dark:text-indigo-400" />
                      <h2 className="font-bold text-slate-800 dark:text-slate-100">Recent Scans</h2>
                    </div>
                    <button onClick={fetchStats} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">Refresh</button>
                  </div>
                  
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Result</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Confidence</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {history.length > 0 ? history.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="px-6 py-4">
                                <span className={cn(
                                  "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                  item.detectionResult === "FAKE" ? "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400" : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                                )}>
                                  {item.detectionResult}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-12 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                      className={cn(
                                        "h-full rounded-full",
                                        item.detectionResult === "FAKE" ? "bg-rose-500" : "bg-emerald-500"
                                      )}
                                      style={{ width: `${item.confidenceLevel}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{item.confidenceLevel}%</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-500">
                                  <Clock size={12} />
                                  {new Date(item.created_at).toLocaleDateString()}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <button 
                                  onClick={() => {
                                    setResult(item);
                                    setView("scanner");
                                  }}
                                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                                >
                                  <ArrowRight size={16} />
                                </button>
                              </td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                                No scan history available yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Safety Score Card */}
                <div className="space-y-6">
                  <div className="bg-indigo-600 dark:bg-indigo-700 rounded-2xl p-6 text-white shadow-xl shadow-indigo-100 dark:shadow-none">
                    <h3 className="font-bold text-lg mb-2">Community Safety</h3>
                    <p className="text-indigo-100 text-sm mb-6">Our collective effort is making the internship market safer for everyone.</p>
                    
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-xs font-bold uppercase tracking-wider mb-2">
                          <span>Scam Detection Rate</span>
                          <span>{stats ? Math.round((stats.fake / stats.total) * 100) : 0}%</span>
                        </div>
                        <div className="w-full h-2 bg-indigo-400/30 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-white rounded-full" 
                            style={{ width: `${stats ? (stats.fake / stats.total) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                      
                      <div className="pt-4 border-t border-indigo-500/30">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                            <ShieldCheck size={20} />
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider opacity-60">Verified Legit</p>
                            <p className="text-xl font-bold">{stats?.real || 0}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-4">Security Insights</h3>
                    <div className="space-y-4">
                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                          <AlertTriangle size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Rising Scam Type</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">"Training Fee" scams are up 12% this month.</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                          <Info size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Verification Tip</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Always check the sender's LinkedIn profile.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : view === "community" ? (
            <motion.div 
              key="community"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="text-center max-w-2xl mx-auto mb-12">
                <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-4">Community Alerts</h2>
                <p className="text-slate-500 dark:text-slate-400">Real-time reports from students and interns across the globe. Stay informed, stay safe.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {history.filter(h => h.detectionResult === "FAKE").slice(0, 9).map((item) => (
                  <div key={item.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <span className="px-2 py-1 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-full text-[10px] font-bold uppercase tracking-wider border border-rose-100 dark:border-rose-900/30">
                        High Risk
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-2 line-clamp-2">Scam Alert: Suspicious Internship Offer</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-3">
                      {item.reasons[0] || "Suspicious patterns detected in this recruitment poster."}
                    </p>
                    <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                          <UserIcon size={12} />
                        </div>
                        <span className="text-xs text-slate-400">Anonymous Reporter</span>
                      </div>
                      <button 
                        onClick={() => {
                          setResult(item);
                          setView("scanner");
                        }}
                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-indigo-600 rounded-3xl p-8 text-white text-center">
                <h3 className="text-2xl font-bold mb-4">Found a suspicious poster?</h3>
                <p className="text-indigo-100 mb-8 max-w-md mx-auto">Help the community by scanning and reporting it. Your contribution saves others from fraud.</p>
                <button 
                  onClick={() => setView("scanner")}
                  className="bg-white text-indigo-600 px-8 py-3 rounded-xl font-bold hover:bg-indigo-50 transition-colors"
                >
                  Report a Scam
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="encyclopedia"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="space-y-12"
            >
              <div className="text-center max-w-2xl mx-auto">
                <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-4">Scam Encyclopedia</h2>
                <p className="text-slate-500 dark:text-slate-400">Knowledge is your best defense. Learn about common scam tactics used in the internship market.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <ShieldAlert size={24} className="text-rose-500" />
                    Common Scam Types
                  </h3>
                  
                  <div className="space-y-4">
                    {[
                      { title: "The Training Fee Scam", desc: "Recruiters ask for a 'refundable' security deposit or training fee before you start. Legitimate companies NEVER ask for money." },
                      { title: "Identity Theft", desc: "Scammers ask for sensitive documents like Aadhaar, PAN, or bank details early in the process to steal your identity." },
                      { title: "The Data Entry Trap", desc: "Unrealistic pay for simple tasks. They often claim you made an error and demand 'penalty' fees to release your salary." },
                      { title: "The Fake Certificate", desc: "Selling internship certificates without any actual work. These are worthless and can get you blacklisted by real companies." }
                    ].map((scam, i) => (
                      <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-2">{scam.title}</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{scam.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <CheckCircle2 size={24} className="text-emerald-500" />
                    Verification Checklist
                  </h3>
                  
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                    {[
                      "Check the company's official website and LinkedIn page.",
                      "Verify the recruiter's email domain (no @gmail.com).",
                      "Search for the company name + 'scam' on Google/Reddit.",
                      "Never pay any amount for an internship opportunity.",
                      "Ask for a formal offer letter on company letterhead.",
                      "Verify the office address on Google Maps."
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-4 p-4 border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <div className="w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                          <CheckCircle2 size={14} />
                        </div>
                        <span className="text-sm text-slate-600 dark:text-slate-300">{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl p-6">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
                      <AlertTriangle size={18} />
                      <h4 className="font-bold">Pro Tip</h4>
                    </div>
                    <p className="text-sm text-amber-600 dark:text-amber-500">
                      If an offer sounds too good to be true, it probably is. Trust your gut and use InternGuard AI to verify.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-12 mt-12 transition-colors">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <ShieldAlert size={20} className="text-indigo-600 dark:text-indigo-400" />
            <span className="font-bold tracking-tight text-slate-900 dark:text-white">InternGuard AI</span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-8">
            Protecting the next generation of talent from fraudulent recruitment practices. 
            Always verify before you apply.
          </p>
          <div className="flex items-center justify-center gap-6 text-xs font-bold text-slate-400 uppercase tracking-widest">
            <a href="#" className="hover:text-slate-900 dark:hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-slate-900 dark:hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-slate-900 dark:hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
