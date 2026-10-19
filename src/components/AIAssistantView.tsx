import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, 
  Send, 
  Sparkles, 
  User, 
  BookOpen, 
  Languages, 
  ShieldAlert,
  Info,
  HelpCircle,
  Database,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Scale,
  LifeBuoy,
  FileText,
  Search,
  CheckCircle2,
  Cpu,
  Mic,
  MicOff,
  Volume2,
  VolumeX
} from 'lucide-react';
import { DistrictStatus } from '../types';
import { GroundedAIResponse } from '../types/ai';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  district?: string;
  risk_score?: number;
  risk_category?: string;
  transparencyBadges?: string[];
  intent?: string;
  isSimulated?: boolean;
  isPrototype?: boolean;
  source?: string;
  timestamp?: string;
}

interface AIAssistantViewProps {
  districts: DistrictStatus[];
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({ districts }) => {
  const [language, setLanguage] = useState<'en' | 'te' | 'hi'>('en');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchDistrict, setSearchDistrict] = useState<string>('');
  const [kbQuery, setKbQuery] = useState<string>('');
  const [kbResults, setKbResults] = useState<any[]>([]);
  const [isSearchingKb, setIsSearchingKb] = useState<boolean>(false);

  // Voice Assistant States
  const [isListening, setIsListening] = useState<boolean>(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `### 🌊 Namaskaram! I am the NeerDrishti Grounded AI Flood Intelligence Engine.
I provide strictly grounded flood risk intelligence, explain multi-factor mathematical calculations (35% Rain, 25% History, 15% Terrain, 15% Citizen, 10% Drainage), analyze predictive forecast horizons (+3h, +6h, +12h, +24h), and generate public safety advisories in **English**, **Telugu (తెలుగు)**, and **Hindi (हिन्दी)** across all **33 Telangana districts**.

**Grounded Knowledge & Evidence Architecture:**
* **Priority Flood Monitoring (5 Districts):** Hyderabad, Warangal, Nirmal, Mancherial, Bhadradri Kothagudem (Deep hydrological knowledge base & ground telemetry)
* **Standard Monitoring (15 Districts):** Seasonal flood-prone and major river basin districts
* **Limited Data Districts (13 Districts):** Baseline prototype scoring with transparent limitations
* **Data Provenance:** Every response strictly cites mathematical risk indices, forecast projections, and active telemetry badges.

How can I assist your flood preparedness or district analysis today?`,
      transparencyBadges: [
        'Deterministic 5-Factor Risk Model',
        'Multi-Horizon Forecast Engine',
        'Verified Knowledge Base',
        '⚡ SIMULATION DATA USED'
      ],
      source: 'NeerDrishti Engine',
    },
  ]);
  const [input, setInput] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Cleanup speech and recognition on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Browser-native Speech Recognition (STT)
  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceNotice('Voice input is supported in Chrome/Edge. Click mic to speak.');
      setTimeout(() => setVoiceNotice(null), 4000);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = false;

      // Select locale according to language
      const langLocale = language === 'hi' ? 'hi-IN' : language === 'te' ? 'te-IN' : 'en-IN';
      recognition.lang = langLocale;

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceNotice(`Listening in ${language === 'hi' ? 'Hindi (हिन्दी)' : language === 'te' ? 'Telugu (తెలుగు)' : 'English'}... Speak now.`);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript || '';
        if (transcript) {
          setInput(transcript);
        }
        setIsListening(false);
        setVoiceNotice(null);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setVoiceNotice('Microphone access denied. Please allow microphone permission in browser settings.');
        } else {
          setVoiceNotice(`Speech recognition error: ${event.error}`);
        }
        setTimeout(() => setVoiceNotice(null), 4000);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
      setVoiceNotice('Voice input could not be started.');
      setTimeout(() => setVoiceNotice(null), 3000);
    }
  };

  // Browser-native Speech Synthesis (TTS)
  const toggleSpeech = (text: string, index: number) => {
    if (!('speechSynthesis' in window)) {
      setVoiceNotice('Voice readout (Speech Synthesis) is not supported in this browser.');
      setTimeout(() => setVoiceNotice(null), 3500);
      return;
    }

    if (speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }

    window.speechSynthesis.cancel();

    // Clean markdown notation for natural speech
    const cleanText = text
      .replace(/###?\s*/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/`/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const targetLang = language === 'hi' ? 'hi-IN' : language === 'te' ? 'te-IN' : 'en-IN';
    utterance.lang = targetLang;

    // Attempt to match matching voice in browser voice list
    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = voices.find(v => v.lang === targetLang || v.lang.startsWith(targetLang.slice(0, 2)));
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    utterance.onend = () => {
      setSpeakingIndex(null);
    };

    utterance.onerror = () => {
      setSpeakingIndex(null);
    };

    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  const handleSend = async (textToSend?: string, langOverride?: 'en' | 'te' | 'hi') => {
    const query = textToSend || input;
    if (!query.trim()) return;

    const currentLang = langOverride || language;
    const userMsg: Message = { role: 'user', content: query };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setIsTyping(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: query,
          language: currentLang,
          districtContext: searchDistrict || undefined,
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply || data.answer || 'Response generated.',
          district: data.district,
          risk_score: data.risk_score,
          risk_category: data.risk_category,
          transparencyBadges: data.transparencyBadges,
          intent: data.intent,
          isSimulated: data.isSimulated,
          isPrototype: data.isPrototype,
          source: data.source,
          timestamp: data.timestamp,
        },
      ]);
    } catch (err) {
      console.error('Chat AI failed:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'I apologize, but I encountered a temporary connection issue. Please verify that your system is running and try again.',
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKbSearch = async () => {
    if (!kbQuery.trim()) return;
    setIsSearchingKb(true);
    try {
      const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(kbQuery)}&limit=3`);
      const data = await res.json();
      setKbResults(data.results || []);
    } catch (err) {
      console.error('KB search failed:', err);
    } finally {
      setIsSearchingKb(false);
    }
  };

  // Structured prompt categories with trilingual labels
  const promptCategories = [
    { id: 'all', labelEn: 'All Queries', labelTe: 'అన్ని ప్రశ్నలు', labelHi: 'सभी प्रश्न', icon: Sparkles },
    { id: 'risk', labelEn: 'District Risk & Factors', labelTe: 'వరద ముప్పు & కారకాలు', labelHi: 'जोखिम एवं कारक', icon: Info },
    { id: 'forecast', labelEn: 'Forecasts & Trends', labelTe: 'సూచనలు & ధోరణులు', labelHi: 'पूर्वानुमान एवं रुझान', icon: TrendingUp },
    { id: 'alert', labelEn: 'Alert Intelligence', labelTe: 'అలర్ట్ వివరాలు', labelHi: 'अलर्ट इंटेलिजेंस', icon: AlertTriangle },
    { id: 'compare', labelEn: 'District Comparison', labelTe: 'జిల్లాల పోలిక', labelHi: 'जिलों की तुलना', icon: Scale },
    { id: 'safety', labelEn: 'Safety Protocols', labelTe: 'రక్షణ పద్ధతులు', labelHi: 'सुरक्षा नियम', icon: LifeBuoy },
  ];

  const samplePrompts = [
    {
      cat: 'risk',
      chipLabelEn: 'Hyderabad Flood Risk',
      chipLabelTe: 'హైదరాబాద్ వరద ముప్పు',
      chipLabelHi: 'हैदराबाद बाढ़ स्थिति',
      textEn: 'What is the current flood risk situation and contributing factors in Hyderabad?',
      textTe: 'హైదరాబాద్ జిల్లాలో ప్రస్తుత వరద పరిస్థితి మరియు ముఖ్య కారణాలు ఏమిటి?',
      textHi: 'हैदराबाद में वर्तमान बाढ़ जोखिम और इसके मुख्य योगदान कारक क्या हैं?',
    },
    {
      cat: 'forecast',
      chipLabelEn: 'Warangal Forecast',
      chipLabelTe: 'వరంగల్ సూచన',
      chipLabelHi: 'वारंगल पूर्वानुमान',
      textEn: 'Which Telangana districts have rising flood risk forecasts over the next +6h and +12h?',
      textTe: 'రాబోయే 6 నుండి 12 గంటల్లో తెలంగాణలో పెరుగుతున్న వరద ముప్పు ఉన్న జిల్లాలు ఏవి?',
      textHi: 'अगले +6h और +12h में वारंगल और तेलंगाना के किन जिलों में बाढ़ का खतरा बढ़ रहा है?',
    },
    {
      cat: 'alert',
      chipLabelEn: 'Alert Details',
      chipLabelTe: 'అలర్ట్ వివరాలు',
      chipLabelHi: 'अलर्ट विवरण',
      textEn: 'Why is an alert active for Bhadradri Kothagudem and what triggered it?',
      textTe: 'భద్రాద్రి కొత్తగూడెం జిల్లాకు అలర్ట్ ఎందుకు జారీ చేయబడింది?',
      textHi: 'भद्राद्री कोठागुडेम के लिए अलर्ट क्यों सक्रिय है और इसे किसने ट्रिगर किया?',
    },
    {
      cat: 'safety',
      chipLabelEn: 'Safety Instructions',
      chipLabelTe: 'రక్షణ సూచనలు',
      chipLabelHi: 'सुरक्षा निर्देश',
      textEn: 'What are the essential flood safety precautions and emergency rules for citizens?',
      textTe: 'వరదల సమయంలో ప్రజలు తీసుకోవాల్సిన ముఖ్యమైన రక్షణ జాగ్రత్తలు ఏమిటి?',
      textHi: 'बाढ़ के दौरान नागरिकों के लिए आवश्यक सुरक्षा सावधानियां और आपातकालीन नियम क्या हैं?',
    },
    {
      cat: 'compare',
      chipLabelEn: 'Nirmal vs Adilabad',
      chipLabelTe: 'నిర్మల్ vs ఆదిలాబాద్',
      chipLabelHi: 'निर्मल vs आदिलाबाद',
      textEn: 'Compare flood risk situation between Nirmal and Adilabad in terms of rainfall and risk',
      textTe: 'నిర్మల్ మరియు ఆదిలాబాద్ జిల్లాల వరద ముప్పు మరియు వర్షపాతాన్ని పోల్చండి',
      textHi: 'निर्मल और आदिलाबाद के बीच वर्षा, स्कोर और बाढ़ के जोखिम की तुलना करें',
    },
    {
      cat: 'risk',
      chipLabelEn: 'Explain 5 Factors',
      chipLabelTe: '5 కారకాలు వివరించండి',
      chipLabelHi: '5 कारक समझाइए',
      textEn: 'Explain how the 5 deterministic factors contribute to the score of Nirmal',
      textTe: 'నిర్మల్ జిల్లా వరద ముప్పు స్కోరును 5 గణాంక సూత్రాల ద్వారా వివరించండి',
      textHi: 'निर्मल जिले के 5 कारकों (वर्षा, इतिहास, भूभाग, नागरिक रिपोर्ट, जल निकासी) के आधार पर स्कोर समझाइए',
    },
    {
      cat: 'compare',
      chipLabelEn: 'Nirmal vs Mancherial',
      chipLabelTe: 'నిర్మల్ vs మంచిర్యాల',
      chipLabelHi: 'निर्मल vs मंचेरियल',
      textEn: 'Compare Nirmal and Mancherial in terms of rainfall, score, and alert levels',
      textTe: 'నిర్మల్ మరియు మంచిర్యాల జిల్లాల మధ్య వర్షపాతం మరియు అలర్ట్‌లను పోల్చండి',
      textHi: 'निर्मल और मंचेरियल के बीच वर्षा, स्कोर और अलर्ट स्तर की तुलना करें',
    },
    {
      cat: 'forecast',
      chipLabelEn: 'Khammam Status',
      chipLabelTe: 'ఖమ్మం పరిస్థితి',
      chipLabelHi: 'खम्मम स्थिति',
      textEn: 'What is the current flood risk and rainfall situation in Khammam district?',
      textTe: 'ఖమ్మం జిల్లా వరద పరిస్థితి మరియు వర్షపాతం వివరాలు తెలపండి',
      textHi: 'खम्मम जिले की वर्तमान स्थिति और वर्षा के आंकड़े क्या हैं?',
    },
  ];

  const filteredPrompts = samplePrompts.filter(p => {
    if (selectedCategory === 'all') return true;
    return p.cat === selectedCategory;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <span>Grounded AI Flood Assistant & RAG Intelligence</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Phase G
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Multi-signal grounded reasoning powered by 5-Factor Risk Model, Predictive Horizons (+3h, +6h, +12h, +24h), and Hydrological RAG.
              </p>
            </div>
          </div>
        </div>

        {/* Language & District Context Selectors */}
        <div className="flex items-center gap-3">
          {/* Language Switch */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setLanguage('en')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                language === 'en'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              English
            </button>
            <button
              onClick={() => setLanguage('te')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${
                language === 'te'
                  ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Languages className="w-3.5 h-3.5" />
              <span>తెలుగు</span>
            </button>
            <button
              onClick={() => setLanguage('hi')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${
                language === 'hi'
                  ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Languages className="w-3.5 h-3.5" />
              <span>हिन्दी</span>
            </button>
          </div>

          {/* District Context Focus */}
          <select
            value={searchDistrict}
            onChange={(e) => setSearchDistrict(e.target.value)}
            className="text-xs font-medium bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Districts Context</option>
            {districts.map((d) => (
              <option key={d.district_id || d.district} value={d.district_id || d.district}>
                {d.district} ({d.risk_category} - {d.flood_risk_score}/100)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chat Area */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[720px]">
          {/* Category Filter Chips */}
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 overflow-x-auto flex gap-1.5 items-center">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
              Categories:
            </span>
            {promptCategories.map((c) => {
              const Icon = c.icon;
              const isSelected = selectedCategory === c.id;
              const label = language === 'hi' ? c.labelHi : language === 'te' ? c.labelTe : c.labelEn;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  className={`whitespace-nowrap px-2.5 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1 shrink-0 ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Voice status banner */}
          {voiceNotice && (
            <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 text-xs text-indigo-900 flex items-center justify-between animate-in fade-in duration-200">
              <span className="flex items-center gap-1.5 font-medium">
                <Info className="w-3.5 h-3.5 text-indigo-600" />
                {voiceNotice}
              </span>
              {isListening && (
                <span className="flex items-center gap-1 text-[11px] text-rose-600 font-bold animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-rose-600" />
                  REC
                </span>
              )}
            </div>
          )}

          {/* Messages list */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-5">
            {messages.map((msg, i) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={i}
                  className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`max-w-[88%] space-y-2`}>
                    {/* Main Bubble */}
                    <div
                      className={`rounded-2xl p-4 sm:p-5 text-xs sm:text-sm leading-relaxed shadow-2xs ${
                        isUser
                          ? 'bg-blue-600 text-white font-medium rounded-br-xs'
                          : 'bg-slate-50/90 border border-slate-200 text-slate-800 rounded-bl-xs'
                      }`}
                    >
                      {/* Attached District Pill if present */}
                      {!isUser && msg.district && (
                        <div className="mb-3 flex items-center gap-2 pb-2 border-b border-slate-200/80">
                          <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                            📍 {msg.district}
                          </span>
                          {msg.risk_score !== undefined && (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              msg.risk_score >= 70
                                ? 'bg-red-100 text-red-700 border border-red-200'
                                : msg.risk_score >= 45
                                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            }`}>
                              Risk: {msg.risk_score}/100 ({msg.risk_category || 'MODERATE'})
                            </span>
                          )}
                        </div>
                      )}

                      <div className="whitespace-pre-wrap">{msg.content}</div>

                      {/* Footer: Grounding Transparency Badges & Speech Output Button */}
                      {!isUser && (
                        <div className="mt-4 pt-3 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-1.5 items-center">
                            {msg.transparencyBadges && msg.transparencyBadges.length > 0 && (
                              <>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                                  Grounding:
                                </span>
                                {msg.transparencyBadges.map((badge, bIdx) => {
                                  const isNotice = badge.includes('SIMULATION') || badge.includes('PROTOTYPE');
                                  return (
                                    <span
                                      key={bIdx}
                                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                                        isNotice
                                          ? 'bg-amber-50 text-amber-800 border border-amber-200 font-bold'
                                          : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                      }`}
                                    >
                                      {badge}
                                    </span>
                                  );
                                })}
                              </>
                            )}
                          </div>

                          {/* Voice Readout Button (Browser-Native SpeechSynthesis) */}
                          <button
                            type="button"
                            onClick={() => toggleSpeech(msg.content, i)}
                            className={`px-2 py-1 rounded text-xs flex items-center gap-1.5 transition-all ${
                              speakingIndex === i
                                ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                                : 'bg-white hover:bg-slate-200 text-slate-600 border border-slate-200'
                            }`}
                            title={speakingIndex === i ? "Stop speaking" : "Listen to answer (Text-to-Speech)"}
                          >
                            {speakingIndex === i ? (
                              <>
                                <VolumeX className="w-3.5 h-3.5 text-white animate-pulse" />
                                <span className="text-[10px]">Stop Voice</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
                                <span className="text-[10px]">Listen</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {isUser && (
                    <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })}

            {isTyping && (
              <div className="flex gap-3 items-center text-slate-400 text-xs">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 animate-spin" />
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 flex items-center gap-1.5 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-bounce delay-100" />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-bounce delay-200" />
                  <span className="ml-2 text-slate-600 font-medium">Retrieving grounded knowledge & synthesizing telemetry...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Suggestion Chips (with Hindi labels) */}
          <div className="p-2 border-t border-slate-100 bg-slate-50/70 overflow-x-auto flex gap-2">
            {filteredPrompts.slice(0, 6).map((p, idx) => {
              const label = language === 'hi' ? p.chipLabelHi : language === 'te' ? p.chipLabelTe : p.chipLabelEn;
              const text = language === 'hi' ? p.textHi : language === 'te' ? p.textTe : p.textEn;
              return (
                <button
                  key={idx}
                  onClick={() => handleSend(text)}
                  title={text}
                  className="whitespace-nowrap px-3 py-1.5 bg-white hover:bg-indigo-50 hover:border-indigo-200 text-[11px] text-slate-700 font-medium rounded-lg border border-slate-200 transition-colors shadow-2xs flex items-center gap-1.5 shrink-0"
                >
                  <ArrowRight className="w-3 h-3 text-indigo-500" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Input Box with Voice Input Button */}
          <div className="p-3 sm:p-4 border-t border-slate-200 bg-white">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              {/* Browser-Native Voice Input (STT) Button */}
              <button
                type="button"
                id="ai-voice-input-btn"
                onClick={toggleListening}
                className={`p-2.5 rounded-lg border transition-all flex items-center justify-center shrink-0 ${
                  isListening 
                    ? 'bg-rose-600 text-white border-rose-700 animate-pulse shadow-md ring-2 ring-rose-300' 
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                }`}
                title={
                  isListening
                    ? "Listening... Click to stop"
                    : `Speak your query in ${language === 'hi' ? 'Hindi' : language === 'te' ? 'Telugu' : 'English'}`
                }
              >
                {isListening ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4" />}
              </button>

              <input
                type="text"
                id="ai-chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  language === 'hi'
                    ? "बाढ़ के जोखिम, पूर्वानुमान, नाला रुकावट या सुरक्षा सलाह के बारे में पूछें (या माइक दबाकर बोलें)..."
                    : language === 'te'
                    ? "వరద ముప్పు, సూచనలు, నాలాల వివరాలు లేదా రక్షణ సలహాల గురించి అడగండి..."
                    : "Ask about district flood risks, forecast trends, nala bottlenecks, or Telugu/Hindi safety advisories..."
                }
                className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-4 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <button
                type="submit"
                id="ai-chat-send-btn"
                disabled={isTyping || !input.trim()}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
          </div>
        </div>

        {/* Sidebar Info & RAG Knowledge Inspector */}
        <div className="lg:col-span-4 space-y-4">
          {/* RAG Knowledge Explorer */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span>RAG Knowledge Search</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">9 documents</span>
            </h3>

            <div className="flex gap-1.5">
              <input
                type="text"
                value={kbQuery}
                onChange={(e) => setKbQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleKbSearch()}
                placeholder="Search safety, nalas, basins..."
                className="flex-1 text-xs bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={handleKbSearch}
                disabled={isSearchingKb || !kbQuery.trim()}
                className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Search Results Preview */}
            {kbResults.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100 max-h-48 overflow-y-auto">
                {kbResults.map((r, rIdx) => (
                  <div key={rIdx} className="bg-slate-50 p-2 rounded border border-slate-200 text-xs space-y-1">
                    <div className="font-bold text-slate-900 flex items-center justify-between">
                      <span>{r.title}</span>
                      <span className="text-[10px] text-indigo-600 font-mono">Score: {r.score}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 line-clamp-3">{r.snippet}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1.5 text-xs text-slate-700 font-mono bg-slate-50 p-2.5 rounded border border-slate-200">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>flood_safety/flood_safety.md</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>project/project.md</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>basins/basins.md</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>districts/5_profiles.md</span>
              </div>
            </div>
          </div>

          {/* Mathematical Grounding Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-2.5">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-600" />
              <span>Grounding Constraints</span>
            </h3>
            <ul className="text-xs text-slate-600 space-y-1.5 leading-relaxed list-disc list-inside">
              <li><b>Zero Hallucination:</b> LLM never invents rainfall numbers or casualty figures.</li>
              <li><b>Deterministic Math:</b> Risk scores strictly computed by formula (35/25/15/15/10).</li>
              <li><b>Alert Integrity:</b> Alerts generated by deterministic multi-signal thresholds.</li>
              <li><b>Simulation Badging:</b> Simulation and prototype statuses are openly declared.</li>
            </ul>
          </div>

          {/* Academic Capstone Disclaimer */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-amber-800">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <span>Academic Prototype Disclaimer</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-800">
              This grounded AI intelligence layer serves as an academic decision-support demonstration. During emergency situations, residents must adhere to official orders from TGSDMA, GHMC, and district collectors.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
