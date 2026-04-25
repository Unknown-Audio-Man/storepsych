import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Clock, User, Mail, Search, ChevronRight, 
  MapPin, Phone, CheckCircle, AlertCircle, Loader2,
  CalendarCheck, Shield, Filter, LogOut, Check, X, ShieldCheck,
  ArrowRight, Heart, Sparkles, Coffee, MessageCircle, Info
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc } from 'firebase/firestore';

// ============================================================================
// FIREBASE CONFIGURATION & INITIALIZATION
// ============================================================================
const getFirebaseConfig = () => {
  // Priority 1: Environment-provided config (for certain preview environments)
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    return JSON.parse(__firebase_config);
  }
  
  // Priority 2: Fallback for local development or manual entry
  // Note: Placeholders are used here to prevent compiler issues in restricted environments.
  return {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  };
};

const firebaseConfig = getFirebaseConfig();

// Only initialize if we have at least an API Key to prevent early crashes
let app, auth, db;
try {
  if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  console.error("Firebase init failed:", e);
}

const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'lakshmi-clinical-portal';
const ADMIN_CODE = 'CLINICAL2026';

// ============================================================================
// HELPER COMPONENTS
// ============================================================================
const Toast = ({ message, type, onClose }) => {
  if (!message) return null;
  const isError = type === 'error';
  return (
    <div className={`fixed top-6 right-6 z-50 flex items-center p-4 rounded-2xl shadow-xl border ${isError ? 'bg-red-50 border-red-100 text-red-800' : 'bg-teal-50 border-teal-100 text-teal-900'} animate-slide-in-right backdrop-blur-md`}>
      {isError ? <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" /> : <CheckCircle className="w-5 h-5 mr-3 flex-shrink-0" />}
      <span className="font-medium text-sm pr-2">{message}</span>
      <button onClick={onClose} className="ml-auto opacity-60 hover:opacity-100 p-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentView, setCurrentView] = useState('home');
  const [dbError, setDbError] = useState(null);
  const [toast, setToast] = useState({ message: '', type: '' });
  
  const [bookings, setBookings] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [bookingForm, setBookingForm] = useState({ name: '', email: '', concern: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(null);

  const [trackEmail, setTrackEmail] = useState('');
  const [trackRef, setTrackRef] = useState('');
  const [trackResult, setTrackResult] = useState(null);
  const [isTrackLoading, setIsTrackLoading] = useState(false);
  
  const [footerClickCount, setFooterClickCount] = useState(0);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!auth) return;
    let isMounted = true;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth init error:", error);
      }
    };
    initAuth();
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (isMounted) setUser(currentUser);
    });
    return () => { isMounted = false; unsubscribeAuth(); };
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const q = collection(db, 'artifacts', APP_ID, 'public', 'data', 'bookings');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => b.createdAt - a.createdAt);
      setBookings(data);
      setDbError(null);
    }, (error) => {
      setDbError(error.message);
    });
    return () => unsubscribe();
  }, [user]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: '' }), 5000);
  };

  const generateRefId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'LM-';
    for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  };

  const timeSlots = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"];

  const upcomingDays = useMemo(() => {
    const days = [];
    let current = new Date();
    current.setHours(0,0,0,0);
    while(days.length < 14) {
      if (current.getDay() !== 0 && current.getDay() !== 6) {
        days.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, []);

  const handleBookAppointment = async (e) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime || !bookingForm.name || !bookingForm.email) {
      showToast("Please complete all required fields.", "error");
      return;
    }
    if (!user || !db) {
      showToast("Clinical systems are currently offline. Please try again later.", "error");
      return;
    }

    setIsSubmitting(true);
    const dateStr = selectedDate.toISOString().split('T')[0];
    const refId = generateRefId();
    const newBooking = {
      date: dateStr,
      time: selectedTime,
      name: bookingForm.name,
      email: bookingForm.email,
      concern: bookingForm.concern,
      refId: refId,
      status: 'Pending',
      createdAt: Date.now(),
      userId: user.uid
    };
    try {
      await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'bookings'), newBooking);
      setBookingSuccess(newBooking);
      setBookingForm({ name: '', email: '', concern: '' });
      setSelectedTime(null);
      setSelectedDate(null);
      showToast("Consultation request submitted.");
    } catch (err) {
      showToast("Failed to process request.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTrackAppointment = (e) => {
    e.preventDefault();
    setIsTrackLoading(true);
    setTimeout(() => {
      const found = bookings.find(b => b.email.toLowerCase() === trackEmail.toLowerCase() && b.refId === trackRef.toUpperCase());
      setTrackResult(found || 'not_found');
      setIsTrackLoading(false);
    }, 800);
  };

  const handleAdminStatusChange = async (id, newStatus) => {
    try {
      await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'bookings', id), { status: newStatus });
      showToast(`Status updated to ${newStatus}`);
    } catch (err) {
      showToast("Update failed", "error");
    }
  };

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPasswordInput === ADMIN_CODE) {
      setIsAdmin(true);
      setShowAdminLogin(false);
      setCurrentView('admin');
      showToast("Administrative Portal Unlocked");
    } else {
      showToast("Invalid code", "error");
    }
    setAdminPasswordInput('');
  };

  // --------------------------------------------------------------------------
  // RENDER: Admin Portal
  // --------------------------------------------------------------------------
  if (currentView === 'admin' && isAdmin) {
    return (
      <div className="min-h-screen bg-stone-50 font-sans text-stone-800 p-6 md:p-10">
        <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-8 rounded-3xl shadow-sm border border-stone-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center border border-teal-100 text-teal-700">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-serif text-stone-900">Clinical Dashboard</h1>
                <p className="text-stone-500 text-sm">Lakshmi Mupparthi • Management View</p>
              </div>
            </div>
            <button onClick={() => setCurrentView('home')} className="bg-stone-900 text-white px-6 py-2 rounded-full text-sm font-medium hover:bg-stone-800 transition-all">Exit Dashboard</button>
          </div>
          <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-stone-50 text-stone-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-6">Patient</th>
                  <th className="p-6">Date/Time</th>
                  <th className="p-6">Ref ID</th>
                  <th className="p-6">Status</th>
                  <th className="p-6">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {bookings.map(b => (
                  <tr key={b.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="p-6">
                      <div className="font-bold">{b.name}</div>
                      <div className="text-xs text-stone-400">{b.email}</div>
                    </td>
                    <td className="p-6">
                      <div className="text-sm font-medium">{b.date}</div>
                      <div className="text-xs text-teal-600">{b.time}</div>
                    </td>
                    <td className="p-6 font-mono text-xs">{b.refId}</td>
                    <td className="p-6">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${b.status === 'Confirmed' ? 'bg-teal-100 text-teal-800' : b.status === 'Cancelled' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="p-6">
                      <select value={b.status} onChange={e => handleAdminStatusChange(b.id, e.target.value)} className="text-xs border rounded-lg p-1 outline-none">
                        <option value="Pending">Pending</option>
                        <option value="Confirmed">Confirmed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFCFB] font-sans text-stone-800 flex flex-col selection:bg-teal-100 selection:text-teal-900">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />

      {/* Navigation */}
      <nav className={`fixed w-full top-0 z-50 transition-all duration-500 ${scrolled ? 'bg-white/90 backdrop-blur-lg shadow-sm py-4' : 'bg-transparent py-6'}`}>
        <div className="max-w-7xl mx-auto px-6 md:px-10 flex justify-between items-center">
          <div className="flex flex-col">
            <h1 className="text-2xl font-serif font-bold tracking-tight text-stone-900">Lakshmi Mupparthi</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-teal-700 font-bold">M.A., R.P. (Qualifying)</p>
          </div>
          <div className="hidden md:flex space-x-10 text-xs font-bold uppercase tracking-widest text-stone-500">
            <a href="#about" className="hover:text-teal-700 transition-colors">Philosophy</a>
            <a href="#services" className="hover:text-teal-700 transition-colors">Focus Areas</a>
            <a href="#booking" className="hover:text-teal-700 transition-colors">Inquiry</a>
          </div>
          <a href="#booking" className="bg-stone-900 text-white px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-teal-900 transition-all shadow-md">
            Consultation
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 md:pt-56 md:pb-32 overflow-hidden bg-gradient-to-b from-stone-100 to-white">
        <div className="max-w-7xl mx-auto px-6 md:px-10 flex flex-col lg:flex-row items-center gap-16 lg:gap-24 relative z-10">
          <div className="lg:w-3/5 space-y-10 animate-fade-in-up">
            <div className="inline-flex items-center gap-3 py-2 px-5 rounded-full bg-white border border-stone-200 text-teal-800 text-[10px] font-bold tracking-[0.2em] uppercase shadow-sm">
              <Sparkles className="w-3 h-3 text-teal-500" />
              Compassionate Clinical Care
            </div>
            <h2 className="text-5xl lg:text-7xl font-serif text-stone-900 leading-[1.05] tracking-tight">
              Healing is a <span className="text-teal-800 italic">Collaborative</span> <br />
              Journey Toward <br />
              Authenticity.
            </h2>
            <p className="text-xl text-stone-500 leading-relaxed max-w-2xl font-light">
              Therapy is more than problem-solving; it is an exploration of the patterns that shape your life. Utilizing evidence-based modalities like CBT, DBT, and EFT, I help you navigate trauma, anxiety, and relationship distress with clinical precision and deep empathy.
            </p>
            <div className="flex flex-col sm:flex-row gap-5 pt-4">
              <a href="#booking" className="bg-teal-800 text-white px-10 py-5 rounded-full font-bold uppercase tracking-widest text-[11px] hover:bg-teal-900 transition-all shadow-xl shadow-teal-900/20 flex items-center justify-center">
                Begin Your Path <ArrowRight className="w-4 h-4 ml-2" />
              </a>
              <a href="#about" className="bg-white border border-stone-200 text-stone-700 px-10 py-5 rounded-full font-bold uppercase tracking-widest text-[11px] hover:bg-stone-50 transition-all flex items-center justify-center">
                Clinical Approach
              </a>
            </div>
          </div>
          <div className="lg:w-2/5 relative animate-fade-in-up delay-200">
            <div className="relative rounded-[3rem] overflow-hidden shadow-2xl border-[12px] border-white transform lg:rotate-2">
              <img 
                src="https://cfir.ca/wp-content/uploads/2023/12/Website-picture-800x914.jpg" 
                alt="Lakshmi Mupparthi" 
                className="w-full h-auto object-cover scale-105"
              />
            </div>
            <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-teal-50 rounded-full -z-10 blur-2xl opacity-50"></div>
          </div>
        </div>
      </section>

      {/* Therapy Style / Welcome Section */}
      <section id="about" className="py-32 bg-white">
        <div className="max-w-5xl mx-auto px-6 text-center space-y-12">
          <div className="space-y-4 max-w-3xl mx-auto">
            <h3 className="text-sm font-bold uppercase tracking-[0.3em] text-teal-700 mb-6">Philosophy & Practice</h3>
            <h4 className="text-4xl font-serif font-medium text-stone-900 leading-snug">
              "My practice is grounded in the belief that everyone possesses the inherent capacity for growth."
            </h4>
          </div>
          <p className="text-lg text-stone-600 leading-relaxed font-light text-left md:text-center">
            As a Registered Psychotherapist (Qualifying) at the <strong>Centre for Interpersonal Relationships (CFIR)</strong>, I work with individuals facing the complexities of trauma, anxiety, and identity. My approach is integrative, meaning I draw from various clinical toolkits to meet your specific needs. Whether we are reframing thought cycles with <strong>CBT</strong>, building emotional regulation skills via <strong>DBT</strong>, or deepening emotional connection through <strong>EFT</strong>, your safety and autonomy remain my highest priority.
          </p>
          <div className="grid md:grid-cols-3 gap-12 pt-12">
            <div className="space-y-4">
              <div className="w-14 h-14 bg-stone-50 rounded-2xl flex items-center justify-center mx-auto text-teal-700 border border-stone-100">
                <Coffee className="w-6 h-6" />
              </div>
              <h5 className="font-bold text-stone-900 uppercase tracking-widest text-xs">Safe Space</h5>
              <p className="text-sm text-stone-500 font-light">A non-judgmental environment where your story is heard and honored.</p>
            </div>
            <div className="space-y-4">
              <div className="w-14 h-14 bg-stone-50 rounded-2xl flex items-center justify-center mx-auto text-teal-700 border border-stone-100">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h5 className="font-bold text-stone-900 uppercase tracking-widest text-xs">Evidence-Based</h5>
              <p className="text-sm text-stone-500 font-light">Clinical interventions proven to foster lasting psychological resilience.</p>
            </div>
            <div className="space-y-4">
              <div className="w-14 h-14 bg-stone-50 rounded-2xl flex items-center justify-center mx-auto text-teal-700 border border-stone-100">
                <MessageCircle className="w-6 h-6" />
              </div>
              <h5 className="font-bold text-stone-900 uppercase tracking-widest text-xs">Collaborative</h5>
              <p className="text-sm text-stone-500 font-light">We work as a team, setting goals that reflect your true aspirations.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Focus Areas Section */}
      <section id="services" className="py-32 bg-[#FAFAF9] border-y border-stone-100">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="flex flex-col lg:flex-row gap-20 items-start">
            <div className="lg:w-1/3 sticky top-32 space-y-8">
              <h3 className="text-sm font-bold uppercase tracking-[0.3em] text-teal-700">Areas of Focus</h3>
              <h4 className="text-5xl font-serif text-stone-900">Clinical <br />Specializations</h4>
              <p className="text-stone-500 font-light leading-relaxed">
                I help adult individuals navigate various challenges, with a primary focus on trauma recovery and professional well-being.
              </p>
              <div className="space-y-4 pt-6">
                {['Cognitive Behavioural (CBT)', 'Dialectical Behavioural (DBT)', 'Emotion-Focused (EFT)', 'Trauma-Informed Care'].map(mod => (
                  <div key={mod} className="flex items-center gap-3 text-xs font-bold text-stone-700 uppercase tracking-widest">
                    <Check className="w-4 h-4 text-teal-600" /> {mod}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="lg:w-2/3 grid sm:grid-cols-2 gap-8">
              <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-stone-100 hover:shadow-md transition-shadow">
                <h5 className="text-2xl font-serif text-stone-900 mb-4">Relational Trauma</h5>
                <p className="text-stone-500 text-sm font-light leading-relaxed mb-6">Processing past interpersonal harm to rebuild trust in yourself and your current relationships.</p>
                <div className="h-1 w-10 bg-teal-100 rounded-full"></div>
              </div>
              <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-stone-100 hover:shadow-md transition-shadow">
                <h5 className="text-2xl font-serif text-stone-900 mb-4">Anxiety & Mood</h5>
                <p className="text-stone-500 text-sm font-light leading-relaxed mb-6">Moving beyond chronic worry and fatigue to find a sense of groundedness and emotional balance.</p>
                <div className="h-1 w-10 bg-teal-100 rounded-full"></div>
              </div>
              <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-stone-100 hover:shadow-md transition-shadow">
                <h5 className="text-2xl font-serif text-stone-900 mb-4">Professional Burnout</h5>
                <p className="text-stone-500 text-sm font-light leading-relaxed mb-6">Addressing high-stress workplace dynamics and restoring your professional and personal boundaries.</p>
                <div className="h-1 w-10 bg-teal-100 rounded-full"></div>
              </div>
              <div className="bg-teal-900 p-10 rounded-[2.5rem] shadow-xl text-white">
                <h5 className="text-2xl font-serif mb-4 text-white">Life Transitions</h5>
                <p className="text-teal-100/70 text-sm font-light leading-relaxed mb-6">Navigating major life shifts (career, identity, relocation) with clarity and psychological support.</p>
                <div className="h-1 w-10 bg-teal-500/30 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Booking Section */}
      <section id="booking" className="py-32 bg-white relative">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-[0.3em] text-teal-700">Inquiry & Intake</h3>
            <h4 className="text-5xl font-serif text-stone-900">Request a Session</h4>
          </div>

          {bookingSuccess ? (
            <div className="bg-teal-50 border border-teal-100 p-16 rounded-[3rem] shadow-2xl max-w-2xl mx-auto text-center animate-fade-in-up">
              <CheckCircle className="w-16 h-16 text-teal-600 mx-auto mb-8" />
              <h4 className="text-3xl font-serif text-stone-900 mb-4">Request Received</h4>
              <p className="text-stone-500 mb-10 font-light">Thank you, {bookingSuccess.name}. Lakshmi will review your request and contact you shortly.</p>
              <div className="bg-white p-8 rounded-2xl border border-teal-200 inline-block">
                <p className="text-[10px] text-teal-600 uppercase font-bold tracking-widest mb-2">Reference ID</p>
                <p className="text-4xl font-mono font-bold text-stone-900">{bookingSuccess.refId}</p>
              </div>
              <button onClick={() => setBookingSuccess(null)} className="mt-12 block mx-auto text-xs font-bold uppercase tracking-widest text-teal-800 underline">Book another session</button>
            </div>
          ) : (
            <div className="bg-white rounded-[3rem] shadow-2xl border border-stone-100 overflow-hidden flex flex-col lg:flex-row">
              <div className="lg:w-5/12 p-12 bg-stone-50 border-r border-stone-100">
                <h5 className="font-bold text-stone-900 mb-10 uppercase tracking-widest text-xs flex items-center"><Calendar className="w-4 h-4 mr-3" /> Select Date</h5>
                <div className="grid grid-cols-2 gap-4 max-h-[450px] overflow-y-auto pr-4 custom-scrollbar">
                  {upcomingDays.map((date, i) => (
                    <button 
                      key={i} 
                      onClick={() => setSelectedDate(date)} 
                      className={`p-5 rounded-2xl border transition-all text-center ${selectedDate?.getTime() === date.getTime() ? 'bg-teal-800 text-white border-teal-800 shadow-lg scale-[1.03]' : 'bg-white border-stone-200 text-stone-800 hover:border-teal-300'}`}
                    >
                      <div className="text-[10px] uppercase font-bold mb-1 opacity-70">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                      <div className="text-xl font-bold">{date.getDate()} {date.toLocaleDateString('en-US', { month: 'short' })}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:w-7/12 p-12">
                {selectedDate ? (
                  <form onSubmit={handleBookAppointment} className="space-y-8 animate-fade-in">
                    <div>
                      <h5 className="font-bold text-stone-900 mb-6 uppercase tracking-widest text-xs flex items-center"><Clock className="w-4 h-4 mr-3" /> Select Time</h5>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {timeSlots.map(time => {
                          const isBooked = bookings.some(b => b.date === selectedDate.toISOString().split('T')[0] && b.time === time && b.status !== 'Cancelled');
                          return (
                            <button key={time} type="button" disabled={isBooked} onClick={() => setSelectedTime(time)} className={`py-3 px-1 text-[11px] font-bold rounded-xl border transition-all ${isBooked ? 'bg-stone-50 border-stone-100 text-stone-300 cursor-not-allowed line-through' : selectedTime === time ? 'bg-teal-800 border-teal-800 text-white shadow-md' : 'bg-white border-stone-200 text-stone-600 hover:border-teal-500 hover:text-teal-700'}`}>
                              {time}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-6 pt-6 border-t border-stone-50">
                      <div className="grid sm:grid-cols-2 gap-6">
                        <input type="text" required placeholder="Full Name" value={bookingForm.name} onChange={e => setBookingForm({...bookingForm, name: e.target.value})} className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-2xl outline-none focus:bg-white focus:ring-2 focus:ring-teal-500/20" />
                        <input type="email" required placeholder="Email Address" value={bookingForm.email} onChange={e => setBookingForm({...bookingForm, email: e.target.value})} className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-2xl outline-none focus:bg-white focus:ring-2 focus:ring-teal-500/20" />
                      </div>
                      <textarea placeholder="Briefly describe your primary concern (Optional)" value={bookingForm.concern} onChange={e => setBookingForm({...bookingForm, concern: e.target.value})} className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-2xl outline-none h-32 focus:bg-white" />
                    </div>
                    <button type="submit" disabled={isSubmitting || !selectedTime} className="w-full bg-stone-900 text-white font-bold py-5 rounded-2xl uppercase tracking-widest text-xs hover:bg-teal-900 transition-all disabled:opacity-50 shadow-md">
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Confirm Consultation Request'}
                    </button>
                  </form>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-stone-300 min-h-[300px]">
                    <CalendarCheck className="w-12 h-12 mb-4 opacity-20" />
                    <p className="font-medium text-stone-400">Please choose a date to see availability.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Patient Portal Lookup */}
      <section className="py-24 bg-teal-950 text-white overflow-hidden relative">
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <Search className="w-10 h-10 text-teal-400 mx-auto mb-6" />
          <h3 className="text-3xl font-serif mb-4 text-white">Patient Portal</h3>
          <p className="text-teal-100/60 mb-12 font-light">Check the status of your appointment inquiry securely.</p>
          <form onSubmit={handleTrackAppointment} className="flex flex-col md:flex-row gap-4 justify-center max-w-2xl mx-auto">
            <input type="email" required value={trackEmail} onChange={e => setTrackEmail(e.target.value)} placeholder="Email" className="w-full px-6 py-4 bg-teal-900/50 border border-teal-800 rounded-2xl text-white outline-none focus:ring-2 focus:ring-teal-400" />
            <input type="text" required value={trackRef} onChange={e => setTrackRef(e.target.value)} placeholder="Ref ID (LM-XXXXXX)" className="w-full px-6 py-4 bg-teal-900/50 border border-teal-800 rounded-2xl text-white uppercase outline-none focus:ring-2 focus:ring-teal-400" />
            <button type="submit" disabled={isTrackLoading} className="bg-white text-teal-950 px-10 py-4 rounded-2xl font-bold uppercase tracking-widest text-[10px] hover:bg-stone-100 transition-colors">
              {isTrackLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Lookup'}
            </button>
          </form>
          {trackResult && (
            <div className="mt-12 p-10 bg-white text-stone-800 rounded-[2.5rem] text-left max-w-md mx-auto shadow-2xl animate-fade-in-up">
              {trackResult === 'not_found' ? <p className="text-center font-bold text-red-500">No records found matching those details.</p> : (
                <div className="space-y-6">
                   <div className="flex justify-between items-center pb-4 border-b border-stone-100">
                     <h5 className="font-serif text-2xl text-stone-900">Status: {trackResult.status}</h5>
                     <div className={`w-3 h-3 rounded-full ${trackResult.status === 'Confirmed' ? 'bg-teal-500' : 'bg-amber-500'}`} />
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-stone-400 uppercase text-[10px] font-bold block mb-1">Date</span><strong className="text-stone-800">{trackResult.date}</strong></div>
                      <div><span className="text-stone-400 uppercase text-[10px] font-bold block mb-1">Time</span><strong className="text-stone-800">{trackResult.time}</strong></div>
                      <div className="col-span-2 pt-2"><span className="text-stone-400 uppercase text-[10px] font-bold block mb-1">Patient</span><strong className="text-stone-800">{trackResult.name}</strong></div>
                   </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-900/50 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2"></div>
      </section>

      {/* Footer */}
      <footer className="bg-stone-950 text-stone-500 py-20 mt-auto">
        <div className="max-w-7xl mx-auto px-6 md:px-10 grid md:grid-cols-2 gap-12 items-start">
          <div>
            <h4 className="text-white font-serif font-bold text-2xl mb-1">Lakshmi Mupparthi</h4>
            <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600 mb-8">Registered Psychotherapist (Qualifying)</p>
            <div className="space-y-4 text-xs font-medium">
              <p className="flex items-center"><MapPin className="w-4 h-4 mr-3 text-teal-700" /> Centre for Interpersonal Relationships (CFIR)</p>
              <p className="flex items-center"><MapPin className="w-4 h-4 mr-3 text-teal-700" /> Toronto • Ottawa • St. Catharines</p>
              <p className="flex items-center"><Info className="w-4 h-4 mr-3 text-teal-700" /> Intake via CFIR Administrative Team</p>
            </div>
          </div>
          <div className="md:text-right flex flex-col md:items-end justify-between h-full">
            <div className="flex gap-4 mb-12">
               <div className="w-10 h-10 rounded-full border border-stone-800 flex items-center justify-center hover:bg-stone-800 transition-colors cursor-pointer text-stone-500 hover:text-white"><Shield className="w-4 h-4" /></div>
               <div className="w-10 h-10 rounded-full border border-stone-800 flex items-center justify-center hover:bg-stone-800 transition-colors cursor-pointer text-stone-500 hover:text-white"><Mail className="w-4 h-4" /></div>
            </div>
            <p className="text-[10px] uppercase tracking-widest opacity-40 cursor-pointer hover:opacity-100 transition-opacity" onClick={() => setFooterClickCount(c => c + 1)}>
              &copy; {new Date().getFullYear()} Clinical Practice Portal. All rights reserved.
            </p>
            {footerClickCount >= 3 && (
              <button onClick={() => setShowAdminLogin(true)} className="mt-4 text-[10px] text-teal-500 font-bold underline">Management Access</button>
            )}
          </div>
        </div>
      </footer>

      {/* Admin Login Modal */}
      {showAdminLogin && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-md flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-[2.5rem] p-12 max-w-sm w-full relative animate-slide-up shadow-2xl">
            <button onClick={() => { setShowAdminLogin(false); setFooterClickCount(0); }} className="absolute top-8 right-8 text-stone-400 hover:text-stone-900"><X /></button>
            <ShieldCheck className="w-12 h-12 text-teal-800 mx-auto mb-6" />
            <h3 className="text-center font-serif text-2xl mb-8 text-stone-900">Clinical Access</h3>
            <form onSubmit={handleAdminLogin}>
              <input type="password" autoFocus value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} placeholder="Portal Access Code" className="w-full px-6 py-4 bg-stone-50 border border-stone-200 rounded-2xl mb-6 text-center text-xl font-mono text-stone-900" />
              <button type="submit" className="w-full bg-stone-900 text-white font-bold py-4 rounded-2xl shadow-lg hover:bg-stone-800 transition-colors">Authenticate</button>
            </form>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Plus+Jakarta+Sans:wght@300;400;600;700&display=swap');
        .font-serif { font-family: 'Cormorant Garamond', serif; }
        .font-sans { font-family: 'Plus Jakarta Sans', sans-serif; }
        .animate-fade-in-up { animation: fadeInUp 0.8s ease-out forwards; }
        .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
      `}} />
    </div>
  );
}
