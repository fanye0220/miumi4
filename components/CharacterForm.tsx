import React, { useState, useRef } from 'react';
import { Character, Theme } from '../types';
import GlassCard from './ui/GlassCard';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { parseQrFile, exportCharacterData, exportQrData } from '../services/cardImportService';
import { X, User, MessageSquare, BookOpen, Upload, ExternalLink, FileJson, Book, Plus, Trash2, Tag, Save, RotateCcw, FileText, QrCode, Layers, Image as ImageIcon, Download, Maximize2, StickyNote, ChevronLeft } from 'lucide-react';

interface CharacterFormProps {
  initialData?: Character;
  onSave: (char: Character) => void;
  onCancel: () => void;
  theme: Theme;
}

const CharacterForm: React.FC<CharacterFormProps> = ({ initialData, onSave, onCancel, theme }) => {
  const [formData, setFormData] = useState<Partial<Character>>(initialData || {
    name: '',
    description: '',
    personality: '',
    firstMessage: '',
    alternate_greetings: [],
    avatarUrl: `https://picsum.photos/seed/${Math.random()}/400/400`,
    scenario: '',
    character_book: { entries: [] },
    tags: [],
    qrList: [],
    originalFilename: '',
    sourceUrl: '',
    cardUrl: initialData?.cardUrl || initialData?.originalFilename || '',
    extra_qr_data: {}
  });
  
  const [error, setError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const qrFileInputRef = useRef<HTMLInputElement>(null);
  const [fullscreenField, setFullscreenField] = useState<{ label: string; value: string; key: keyof typeof formData } | null>(null);
  // 全屏开场白弹窗：-1=主开场白，0,1,2...=备选开场白
  const [firstMesFullscreen, setFirstMesFullscreen] = useState(false);
  const [firstMesTabIndex, setFirstMesTabIndex] = useState(-1); // -1=主开场白

  // Handlers
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData(prev => ({ 
          ...prev, 
          avatarUrl: URL.createObjectURL(file),
          originalFilename: file.name,
          cardUrl: file.name // Auto-fill cardUrl with filename on upload
      }));
    }
  };

  const handleQrFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { list, raw } = await parseQrFile(file);
      setFormData(prev => ({ 
          ...prev, 
          qrList: list,
          extra_qr_data: raw, // Store raw data for export
          qrFileName: file.name
      }));
      alert(`成功绑定 ${list.length} 个 QR 动作!`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      if (qrFileInputRef.current) qrFileInputRef.current.value = '';
    }
  };

  const handleQrExport = () => {
      if (!formData.qrList || formData.qrList.length === 0) {
          alert("没有可导出的 QR 数据");
          return;
      }
      exportQrData(formData.qrList, formData.extra_qr_data);
  };

  const handleClearQr = () => {
      if (confirm("确定要清除当前的 QR 配置吗？")) {
          setFormData(prev => ({
              ...prev,
              qrList: [],
              extra_qr_data: {},
              qrFileName: ''
          }));
      }
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = e.currentTarget.value.trim();
      const currentTags = Array.isArray(formData.tags) ? formData.tags : [];
      if (val && !currentTags.includes(val)) {
        setFormData(prev => ({ ...prev, tags: [...currentTags, val] }));
        e.currentTarget.value = '';
      }
    }
  };

  const removeTag = (tag: string) => {
    const currentTags = Array.isArray(formData.tags) ? formData.tags : [];
    setFormData(prev => ({ ...prev, tags: currentTags.filter(t => t !== tag) }));
  };

  const handleAddAltGreeting = () => {
    setFormData(prev => ({ ...prev, alternate_greetings: [...(prev.alternate_greetings || []), ''] }));
  };

  const updateAltGreeting = (index: number, val: string) => {
    const newGreetings = [...(formData.alternate_greetings || [])];
    newGreetings[index] = val;
    setFormData(prev => ({ ...prev, alternate_greetings: newGreetings }));
  };

  const removeAltGreeting = (index: number) => {
    setFormData(prev => ({ ...prev, alternate_greetings: prev.alternate_greetings?.filter((_, i) => i !== index) }));
  };

  // Construct the full character object for saving/exporting
  const getFullCharacter = (): Character => ({
      ...initialData,
      id: initialData?.id || crypto.randomUUID(),
      name: formData.name || "Unknown",
      description: formData.description || '',
      personality: formData.personality || '',
      firstMessage: formData.firstMessage || '',
      alternate_greetings: formData.alternate_greetings || [],
      avatarUrl: formData.avatarUrl!,
      scenario: formData.scenario || '',
      character_book: formData.character_book,
      tags: formData.tags || [],
      qrList: formData.qrList || [],
      originalFilename: formData.originalFilename,
      sourceUrl: formData.sourceUrl || '',
      cardUrl: formData.cardUrl || '',
      creator_notes: formData.creator_notes || '',
      mes_example: (formData as any).mes_example || '',
      system_prompt: (formData as any).system_prompt || '',
      post_history_instructions: (formData as any).post_history_instructions || '',
      note: formData.note || '',
      updatedAt: Date.now(), // Add updatedAt for sorting
      importDate: initialData?.importDate || Date.now() // Preserve or set importDate
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      setError("名字是必填项。");
      return;
    }
    onSave(getFullCharacter());
  };

  const handleExport = async (exportType: 'png' | 'json' | 'package') => {
      if (!formData.name) {
          setError("请先填写角色名称");
          return;
      }
      
      const char = getFullCharacter();
      
      let targetFormat: 'png' | 'json' = 'png';
      let forceZip = false;

      if (exportType === 'package') {
          // Determine format based on importFormat. Default to 'png' if unknown.
          targetFormat = (char.importFormat === 'json') ? 'json' : 'png';
          forceZip = true;
          
          if (!char.qrList || char.qrList.length === 0) {
              alert("没有绑定 QR 动作，无法打包。");
              return;
          }
      } else {
          targetFormat = exportType;
      }

      // Check if trying to export PNG from a JSON-imported character (or one without a proper avatar)
      if (targetFormat === 'png' && char.importFormat === 'json') {
          // Check if user has uploaded a new avatar (blob url) or still using placeholder
          if (formData.avatarUrl?.includes('picsum.photos')) {
               if (!window.confirm("该角色是通过 JSON 导入的，且似乎没有上传自定义头像（当前是随机占位图）。\n导出 PNG 会将数据嵌入到这张占位图中。\n\n确定要继续吗？建议先在编辑页面上传一张图片。")) {
                   return;
               }
          }
      }

      try {
          await exportCharacterData(char, targetFormat, forceZip);
      } catch (err: any) {
          setError(err.message);
      }
  };

  // Styles
  const labelColor = theme === 'light' ? 'text-slate-500 font-bold text-xs uppercase tracking-wider' : 'text-blue-200/70 font-bold text-xs uppercase tracking-wider';
  const inputBg = theme === 'light' ? 'bg-white/50 border-slate-200 text-slate-800 focus:border-blue-400 focus:bg-white' : 'bg-black/20 border-white/10 text-white focus:border-white/30 focus:bg-black/30';
  const sectionTitle = `text-lg font-bold flex items-center gap-2 mb-4 ${theme === 'light' ? 'text-slate-700' : 'text-white'}`;
  const dividerClass = theme === 'light' ? 'border-slate-200' : 'border-white/10';

  return (
    <div className="h-full w-full max-w-4xl mx-auto animate-fade-in flex flex-col relative">
       
       {/* Dynamic Background */}
       <div className="fixed inset-0 z-0 pointer-events-none">
           <div 
               className="absolute inset-0 bg-cover bg-center transition-all duration-700 opacity-80 scale-110"
               style={{ backgroundImage: `url(${formData.avatarUrl})` }}
           />
           <div className={`absolute inset-0 backdrop-blur-[40px] ${theme === 'light' ? 'bg-white/30' : 'bg-[#0f172a]/30'}`} />
           <div className={`absolute inset-0 ${theme === 'light' ? 'bg-gradient-to-b from-white/20 to-white/60' : 'bg-gradient-to-b from-black/10 to-[#0f172a]/60'}`} />
       </div>

       {/* ── 固定返回按钮（极简透明玻璃） ── */}
       <div className="sticky top-0 z-30 shrink-0 px-4 md:px-6 pt-4 pb-2 pointer-events-none">
           <button
               onClick={onCancel}
               className={`pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-2xl text-sm font-bold transition-all backdrop-blur-xl shadow-sm
                   ${theme === 'light'
                       ? 'bg-white/40 border border-white/60 text-slate-700 hover:bg-white/70'
                       : 'bg-white/10 border border-white/15 text-white/80 hover:bg-white/20'}`}
           >
               <ChevronLeft size={16} /> 返回
           </button>
       </div>

       {/* Main Scroll Container */}
       <div className="flex-1 overflow-y-auto custom-scrollbar pb-32 relative z-10 p-4 md:p-6 pt-2">
          
          {/* 1. Identity Card (Avatar + Basic Info) */}
          <GlassCard theme={theme} className="p-6 mb-6 !bg-opacity-80">
             {/* Internal Header */}
             <div className="flex justify-between items-center mb-6">
                 <h2 className={`text-xl font-bold ${theme === 'light' ? 'text-slate-800' : 'text-white'}`}>
                     {formData.name ? '编辑角色' : '新建角色'}
                 </h2>
             </div>

             <div className="flex flex-col md:flex-row gap-8">
                 {/* Left: Avatar */}
                 <div className="shrink-0 flex flex-col items-center md:items-start gap-3 w-full md:w-auto">
                     <div className={`w-64 h-64 rounded-2xl overflow-hidden relative group shadow-2xl ${theme === 'light' ? 'bg-slate-200' : 'bg-black/40'}`}>
                        <img src={formData.avatarUrl} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        <div onClick={() => avatarInputRef.current?.click()} className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer backdrop-blur-sm">
                            <Upload size={32} className="mb-2 opacity-90" /> 
                            <span className="font-bold text-sm">更换头像</span>
                        </div>
                     </div>
                     <input type="file" accept="image/*" className="hidden" ref={avatarInputRef} onChange={handleAvatarChange} />

                     <input 
                        value={formData.originalFilename || ''}
                        onChange={e => setFormData({...formData, originalFilename: e.target.value})}
                        placeholder="文件名"
                        className={`w-64 rounded-xl px-3 py-3 text-sm outline-none transition-all text-center ${inputBg}`}
                     />
                 </div>

                 {/* Right: Inputs */}
                 <div className="flex-1 space-y-5 w-full">
                    <div>
                        <label className={`block mb-2 ${labelColor}`}>角色名称 (NAME)</label>
                        <input 
                            value={formData.name} 
                            onChange={e => setFormData({...formData, name: e.target.value})}
                            className={`w-full rounded-xl px-4 py-3 text-lg font-bold outline-none transition-all ${inputBg}`}
                            placeholder="Unknown"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={`block mb-2 ${labelColor}`}>导入时间 (IMPORTED)</label>
                            <div className={`w-full rounded-xl px-4 py-3 text-sm font-mono opacity-80 truncate ${inputBg}`}>
                                {formData.importDate ? new Date(formData.importDate).toLocaleString() : 'Unknown'}
                            </div>
                        </div>
                        <div>
                            <label className={`block mb-2 ${labelColor}`}>本地修改时间 (MODIFIED)</label>
                            <div className={`w-full rounded-xl px-4 py-3 text-sm font-mono opacity-80 truncate ${inputBg}`}>
                                {new Date().toLocaleString()}
                            </div>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={`block mb-2 ${labelColor}`}>标签 (TAGS)</label>
                            <div className={`w-full rounded-xl px-3 py-2 min-h-[46px] flex flex-wrap gap-2 transition-all ${inputBg}`}>
                                {(Array.isArray(formData.tags) ? formData.tags : []).map(tag => (
                                    <span key={tag} className="px-2 py-1 rounded-md bg-white/10 text-xs font-bold flex items-center gap-1 cursor-default border border-white/10">
                                        {tag}
                                        <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-400"><X size={10}/></button>
                                    </span>
                                ))}
                                <input 
                                    className="bg-transparent focus:outline-none text-sm min-w-[60px] px-1 py-1 flex-1"
                                    placeholder="+ Tag"
                                    onKeyDown={handleAddTag}
                                    onBlur={(e) => {
                                        const val = e.target.value.trim();
                                        const currentTags = Array.isArray(formData.tags) ? formData.tags : [];
                                        if (val && !currentTags.includes(val)) {
                                            setFormData(prev => ({ ...prev, tags: [...currentTags, val] }));
                                            e.target.value = '';
                                        }
                                    }}
                                />
                            </div>
                       </div>
                       <div>
                            <label className={`block mb-2 ${labelColor}`}>来源链接 (SOURCE)</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text"
                                    value={formData.sourceUrl}
                                    onChange={(e) => setFormData({...formData, sourceUrl: e.target.value})}
                                    placeholder="https://..."
                                    className={`flex-1 rounded-xl px-4 py-3 text-sm outline-none transition-all ${inputBg}`}
                                />
                                {formData.sourceUrl && (
                                    <a 
                                        href={formData.sourceUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className={`p-3 rounded-xl transition-colors flex items-center justify-center ${theme === 'light' ? 'bg-slate-200 hover:bg-slate-300 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                                        title="打开链接"
                                    >
                                        <ExternalLink size={18} />
                                    </a>
                                )}
                            </div>
                       </div>
                    </div>
                 </div>
             </div>
          </GlassCard>

          {/* 2. Details Card */}
          <GlassCard theme={theme} className="p-6 mb-6 !bg-opacity-60">
              <div className={sectionTitle}><BookOpen size={20}/> 详细设定</div>
              <div className="space-y-6">

                {/* Description */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className={labelColor}>描述 (DESCRIPTION)</label>
                        <button type="button" onClick={() => setFullscreenField({ label: '描述 (DESCRIPTION)', value: formData.description || '', key: 'description' })}
                            className={`text-xs px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors ${theme === 'light' ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}>
                            <Maximize2 size={11}/> 全屏
                        </button>
                    </div>
                    <textarea rows={6} value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})}
                        className={`w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all font-mono ${inputBg}`} placeholder="角色的详细描述..." />
                    <div className={`text-right text-xs mt-1 font-mono ${theme === 'light' ? 'text-slate-400' : 'text-gray-600'}`}>{(formData.description || '').length} 字符</div>
                </div>

                {/* Personality */}
                <div>
                    <label className={`block mb-2 ${labelColor}`}>性格 (PERSONALITY)</label>
                    <textarea rows={3} value={formData.personality || ''} onChange={e => setFormData({...formData, personality: e.target.value})}
                        className={`w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all font-mono ${inputBg}`} placeholder="角色的性格特征..." />
                </div>

                {/* Scenario */}
                <div>
                    <label className={`block mb-2 ${labelColor}`}>场景设定 (SCENARIO)</label>
                    <textarea rows={3} value={formData.scenario || ''} onChange={e => setFormData({...formData, scenario: e.target.value})}
                        className={`w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all font-mono ${inputBg}`} placeholder="故事发生的背景场景..." />
                </div>

                {/* Mes Example */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className={labelColor}>对话示例 (MES EXAMPLE)</label>
                        <button type="button" onClick={() => setFullscreenField({ label: '对话示例 (MES EXAMPLE)', value: formData.mes_example || '', key: 'mes_example' as any })}
                            className={`text-xs px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors ${theme === 'light' ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}>
                            <Maximize2 size={11}/> 全屏
                        </button>
                    </div>
                    <textarea rows={5} value={formData.mes_example || ''} onChange={e => setFormData({...formData, mes_example: e.target.value as any})}
                        className={`w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all font-mono ${inputBg}`} placeholder="<START>&#10;{{user}}: ...&#10;{{char}}: ..." />
                </div>

                {/* System Prompt */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className={labelColor}>系统提示词 (SYSTEM PROMPT)</label>
                        <button type="button" onClick={() => setFullscreenField({ label: '系统提示词 (SYSTEM PROMPT)', value: formData.system_prompt || '', key: 'system_prompt' as any })}
                            className={`text-xs px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors ${theme === 'light' ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}>
                            <Maximize2 size={11}/> 全屏
                        </button>
                    </div>
                    <textarea rows={4} value={formData.system_prompt || ''} onChange={e => setFormData({...formData, system_prompt: e.target.value as any})}
                        className={`w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all font-mono ${inputBg}`} placeholder="注入到上下文顶部的系统级指令..." />
                </div>

                {/* Post History Instructions */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className={labelColor}>历史后指令 (POST HISTORY INSTRUCTIONS)</label>
                        <button type="button" onClick={() => setFullscreenField({ label: '历史后指令', value: formData.post_history_instructions || '', key: 'post_history_instructions' as any })}
                            className={`text-xs px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors ${theme === 'light' ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}>
                            <Maximize2 size={11}/> 全屏
                        </button>
                    </div>
                    <textarea rows={3} value={formData.post_history_instructions || ''} onChange={e => setFormData({...formData, post_history_instructions: e.target.value as any})}
                        className={`w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all font-mono ${inputBg}`} placeholder="插入在历史记录之后的指令..." />
                </div>

              </div>
          </GlassCard>

          {/* 3. Conversation Card (First Message / QR / Alt Greetings) */}
          <GlassCard theme={theme} className="p-6 mb-6 !bg-opacity-60">
             
             {/* First Message Header with Full Screen Button */}
             <div className="flex justify-between items-center mb-4">
                <label className={`flex items-center gap-2 ${labelColor}`}>
                    <MessageSquare size={14}/> 开场白 (FIRST MESSAGE)
                </label>
                <button 
                    type="button"
                    onClick={() => { setFirstMesFullscreen(true); setFirstMesTabIndex(-1); }}
                    className={`text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors ${theme === 'light' ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'}`}>
                    <Maximize2 size={12}/> 全屏编辑
                    {(formData.alternate_greetings?.length ?? 0) > 0 && (
                        <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${theme === 'light' ? 'bg-blue-200 text-blue-700' : 'bg-blue-500/40 text-blue-200'}`}>
                            +{formData.alternate_greetings!.length}
                        </span>
                    )}
                </button>
             </div>

             {/* First Message Content */}
             <div className={`w-full rounded-2xl p-6 mb-8 text-sm leading-relaxed relative group ${theme === 'light' ? 'bg-slate-50' : 'bg-white/5'}`}>
                <textarea 
                    rows={8}
                    value={formData.firstMessage}
                    onChange={e => setFormData({...formData, firstMessage: e.target.value})}
                    className="w-full bg-transparent outline-none resize-none custom-scrollbar"
                    placeholder="角色的第一句话..."
                />
                <div className="absolute bottom-2 right-4 text-xs opacity-40 pointer-events-none">
                    {formData.firstMessage?.length || 0} chars
                </div>
             </div>

             <div className={`border-t mb-8 ${dividerClass}`}></div>

             {/* Alternate Greetings */}
             <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                    <label className={`flex items-center gap-2 ${labelColor}`}>
                        <Layers size={14}/> 备选开场白 ({formData.alternate_greetings?.length || 0})
                    </label>
                    <button 
                        onClick={handleAddAltGreeting}
                        className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-bold transition-colors ${theme === 'light' ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'}`}
                    >
                        <Plus size={14}/> 添加
                    </button>
                </div>
                
                <div className="space-y-4">
                    {formData.alternate_greetings?.map((msg, idx) => (
                        <div key={idx} className={`relative group p-4 rounded-xl transition-all ${theme === 'light' ? 'bg-white border border-slate-100 shadow-sm' : 'bg-white/5 border border-white/5 hover:bg-white/10'}`}>
                            <div className="flex justify-between items-start gap-3">
                                <span className={`text-[10px] font-bold uppercase tracking-widest opacity-50 mt-1 ${theme === 'light' ? 'text-slate-400' : 'text-blue-300'}`}>
                                    Alternate #{idx + 1}
                                </span>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            if(confirm('Use this greeting as the main First Message?')) {
                                                setFormData(prev => ({ ...prev, firstMessage: msg }));
                                            }
                                        }}
                                        className="p-1.5 text-blue-400 hover:text-blue-500 transition-colors rounded-md hover:bg-blue-500/10"
                                        title="Use as First Message"
                                    >
                                        <RotateCcw size={14}/>
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => removeAltGreeting(idx)}
                                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-md hover:bg-red-500/10"
                                        title="Remove"
                                    >
                                        <Trash2 size={14}/>
                                    </button>
                                </div>
                            </div>
                            <textarea 
                                rows={3}
                                value={msg}
                                onChange={e => updateAltGreeting(idx, e.target.value)}
                                className="w-full bg-transparent outline-none resize-none custom-scrollbar text-sm mt-2 leading-relaxed"
                                placeholder="输入备选开场白内容..."
                            />
                        </div>
                    ))}
                    {(!formData.alternate_greetings || formData.alternate_greetings.length === 0) && (
                        <div className={`text-center py-8 border border-dashed rounded-xl text-xs ${theme === 'light' ? 'border-slate-300 text-slate-400' : 'border-white/10 text-gray-500'}`}>
                            暂无备选开场白
                        </div>
                    )}
                </div>
             </div>

             <div className={`border-t mb-8 ${dividerClass}`}></div>

             {/* QR Section */}
             <div>
                  <div className="flex justify-between items-center mb-3">
                       <label className={`flex items-center gap-2 ${labelColor}`}>
                           <QrCode size={14}/> 快速回复按钮 (QUICK REPLIES)
                       </label>
                       <input type="file" accept=".json" className="hidden" ref={qrFileInputRef} onChange={handleQrFileImport} />
                  </div>
                  
                  <div className={`rounded-2xl border-2 border-dashed transition-all duration-300 ${
                      formData.qrList && formData.qrList.length > 0 
                        ? (theme === 'light' ? 'border-slate-300 bg-slate-50/50' : 'border-white/20 bg-white/5')
                        : (theme === 'light' ? 'border-slate-200 bg-slate-50/30 hover:bg-slate-50/50' : 'border-white/10 bg-white/5 hover:bg-white/10')
                  }`}>
                      {formData.qrList && formData.qrList.length > 0 ? (
                          <div className="p-6">
                              <div className="flex justify-between items-center mb-4">
                                  <div className="flex items-center gap-2">
                                      <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                                      <span className={`font-bold text-sm ${theme === 'light' ? 'text-slate-700' : 'text-gray-200'}`}>
                                          已导入快速回复配置
                                      </span>
                                  </div>
                                  <button 
                                      onClick={handleClearQr}
                                      className="p-1.5 rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                                      title="清除配置"
                                  >
                                      <Trash2 size={16} />
                                  </button>
                              </div>

                              <div className={`w-full rounded-xl px-4 py-3 mb-4 text-sm font-mono flex items-center ${theme === 'light' ? 'bg-white border border-slate-200 text-slate-600' : 'bg-black/20 border border-white/5 text-gray-300'}`}>
                                  <span className="opacity-50 mr-2">文件名:</span>
                                  <span className="truncate flex-1">{formData.qrFileName || 'imported_config.json'}</span>
                              </div>

                              <button 
                                  onClick={handleQrExport}
                                  className={`w-full py-3 rounded-xl font-bold text-white transition-colors flex items-center justify-center gap-2 shadow-lg ${theme === 'light' ? 'bg-slate-800 hover:bg-slate-700 shadow-slate-800/20' : 'bg-white/10 hover:bg-white/20 shadow-white/5 border border-white/10'}`}
                              >
                                  <Download size={18} />
                                  下载 JSON
                              </button>
                          </div>
                      ) : (
                          <div className="p-8 flex flex-col items-center justify-center gap-4 text-center">
                              <div className={`p-4 rounded-full mb-2 ${theme === 'light' ? 'bg-slate-100 text-slate-500' : 'bg-white/10 text-gray-400'}`}>
                                  <Upload size={32} strokeWidth={1.5} />
                              </div>
                              <div className={`text-sm font-medium ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>
                                  未导入快速回复配置
                              </div>
                              <button 
                                  onClick={() => qrFileInputRef.current?.click()}
                                  className={`px-8 py-2.5 rounded-xl font-bold text-white transition-colors flex items-center gap-2 shadow-lg ${theme === 'light' ? 'bg-slate-800 hover:bg-slate-700 shadow-slate-800/20' : 'bg-white/10 hover:bg-white/20 shadow-white/5 border border-white/10'}`}
                              >
                                  <FileJson size={18} />
                                  导入 JSON
                              </button>
                          </div>
                      )}
                  </div>
             </div>

          </GlassCard>

          {/* 4. Lorebook (Compact) */}
          {formData.character_book?.entries?.length > 0 && (
             <GlassCard theme={theme} className="p-4 mb-6 opacity-80 hover:opacity-100 transition-opacity">
                <div className="flex justify-between items-center">
                    <div className="font-bold text-sm flex items-center gap-2"><Book size={16}/> 世界书条目</div>
                    <div className="text-xs opacity-60">{formData.character_book?.entries?.length} entries</div>
                </div>
             </GlassCard>
          )}

          {/* 5. Note & Creator Notes */}
          <GlassCard theme={theme} className="p-6 mb-6 !bg-opacity-60">
              <div className={sectionTitle}><StickyNote size={20}/> 备注 & 作者信息</div>
              <div className="space-y-5">
                  <div>
                      <label className={`block mb-2 ${labelColor}`}>个人备注 (NOTE)</label>
                      <textarea
                          rows={3}
                          value={formData.note || ''}
                          onChange={e => setFormData({...formData, note: e.target.value})}
                          className={`w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all ${inputBg}`}
                          placeholder="记录你自己的备注，不会被导出到卡片数据中..."
                      />
                  </div>
                  <div>
                      <label className={`block mb-2 ${labelColor}`}>作者备注 (CREATOR NOTES)</label>
                      <textarea
                          rows={3}
                          value={formData.creator_notes || ''}
                          onChange={e => setFormData({...formData, creator_notes: e.target.value})}
                          className={`w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all ${inputBg}`}
                          placeholder="作者的原始备注..."
                      />
                  </div>
              </div>
          </GlassCard>

       </div>

       {/* Sticky Bottom Export Button */}
       <div className="absolute bottom-6 left-0 right-0 px-6 z-20 flex justify-center pointer-events-none">
           <div className="pointer-events-auto flex w-full max-w-md shadow-2xl rounded-full overflow-hidden transform transition-transform hover:scale-[1.02]">
               <button 
                 onClick={() => handleExport('json')}
                 className={`flex-1 font-bold text-lg py-4 flex items-center justify-center gap-2 transition-colors border-r border-black/5
                    ${theme === 'light' 
                        ? 'bg-white/90 text-slate-600 hover:bg-white' 
                        : 'bg-white/10 text-white/80 hover:bg-white/20 backdrop-blur-md'}`}
               >
                   <FileJson size={20} /> 
                   导出 JSON
               </button>
               <button 
                 onClick={() => handleExport('png')}
                 className={`flex-1 font-bold text-lg py-4 flex items-center justify-center gap-2 transition-colors
                    ${theme === 'light' 
                        ? 'bg-white/90 text-slate-600 hover:bg-white' 
                        : 'bg-white/10 text-white/80 hover:bg-white/20 backdrop-blur-md'}`}
               >
                   <ImageIcon size={20} /> 
                   导出 PNG
               </button>
               
               {/* Package Export Button - Only if QR exists */}
               {formData.qrList && formData.qrList.length > 0 && (
                   <button 
                     onClick={() => handleExport('package')}
                     className={`w-16 font-bold text-lg py-4 flex items-center justify-center gap-2 transition-colors border-l border-black/5
                        ${theme === 'light' 
                            ? 'bg-blue-500/90 text-white hover:bg-blue-600' 
                            : 'bg-blue-600/80 text-white hover:bg-blue-500 backdrop-blur-md'}`}
                     title="打包导出 (QR + 卡片)"
                   >
                       <Layers size={20} /> 
                   </button>
               )}
           </div>
       </div>
       
       {error && (
           <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-6 py-3 rounded-full text-sm shadow-xl animate-bounce z-[99999] flex items-center gap-2">
               <span className="font-bold">Error:</span> {error}
               <button onClick={() => setError(null)} className="ml-2 hover:bg-white/20 rounded-full p-1"><X size={12}/></button>
           </div>
       )}

       {/* ── 全屏开场白编辑器 Modal ── */}
       {firstMesFullscreen && (
           <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: theme === 'light' ? 'rgba(248,250,252,0.97)' : 'rgba(10,12,20,0.97)' }}>
               {/* 弹窗顶栏 */}
               <div className={`flex items-center justify-between px-6 py-3 border-b shrink-0 ${theme === 'light' ? 'bg-white/90 border-slate-200' : 'bg-slate-900/90 border-white/10'}`}>
                   <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 flex-1 min-w-0">
                       {/* 主开场白 Tab */}
                       <button
                           onClick={() => setFirstMesTabIndex(-1)}
                           className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                               firstMesTabIndex === -1
                                   ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                                   : (theme === 'light' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-white/10 text-gray-400 hover:bg-white/20')
                           }`}
                       >
                           主开场白
                           <span className="ml-1.5 opacity-60 text-[10px]">{(formData.firstMessage?.length || 0)}字</span>
                       </button>
                       {/* 备选开场白 Tabs */}
                       {(formData.alternate_greetings || []).map((msg, idx) => (
                           <button
                               key={idx}
                               onClick={() => setFirstMesTabIndex(idx)}
                               className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                   firstMesTabIndex === idx
                                       ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30'
                                       : (theme === 'light' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-white/10 text-gray-400 hover:bg-white/20')
                               }`}
                           >
                               备选 #{idx + 1}
                               <span className="ml-1.5 opacity-60 text-[10px]">{msg.length}字</span>
                           </button>
                       ))}
                       {/* 新增备选 */}
                       <button
                           onClick={() => {
                               const newIdx = (formData.alternate_greetings || []).length;
                               setFormData(prev => ({ ...prev, alternate_greetings: [...(prev.alternate_greetings || []), ''] }));
                               setFirstMesTabIndex(newIdx);
                           }}
                           className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${theme === 'light' ? 'bg-slate-100 text-slate-400 hover:bg-slate-200' : 'bg-white/10 text-gray-500 hover:bg-white/20'}`}
                           title="新增备选开场白"
                       >
                           <Plus size={12} />
                       </button>
                   </div>
                   <div className="flex items-center gap-2 ml-4 shrink-0">
                       {firstMesTabIndex >= 0 && (
                           <button
                               onClick={() => {
                                   if (!window.confirm('将此备选开场白设为主开场白？')) return;
                                   const alt = (formData.alternate_greetings || [])[firstMesTabIndex];
                                   const newAlts = (formData.alternate_greetings || []).filter((_, i) => i !== firstMesTabIndex);
                                   setFormData(prev => ({ ...prev, firstMessage: alt, alternate_greetings: newAlts }));
                                   setFirstMesTabIndex(-1);
                               }}
                               className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${theme === 'light' ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}
                               title="设为主开场白"
                           >
                               <RotateCcw size={12} /> 设为主
                           </button>
                       )}
                       {firstMesTabIndex >= 0 && (
                           <button
                               onClick={() => {
                                   if (!window.confirm('删除此备选开场白？')) return;
                                   setFormData(prev => ({ ...prev, alternate_greetings: (prev.alternate_greetings || []).filter((_, i) => i !== firstMesTabIndex) }));
                                   setFirstMesTabIndex(Math.max(-1, firstMesTabIndex - 1));
                               }}
                               className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${theme === 'light' ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
                           >
                               <Trash2 size={12} /> 删除
                           </button>
                       )}
                       <button
                           onClick={() => setFirstMesFullscreen(false)}
                           className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${theme === 'light' ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-white/10 text-white hover:bg-white/20'}`}
                       >
                           完成
                       </button>
                   </div>
               </div>
               {/* 文本区 */}
               <div className="flex-1 flex flex-col min-h-0 p-4 md:p-6">
                   <textarea
                       autoFocus
                       key={firstMesTabIndex} // 切换tab时重新focus
                       value={firstMesTabIndex === -1
                           ? (formData.firstMessage || '')
                           : ((formData.alternate_greetings || [])[firstMesTabIndex] || '')}
                       onChange={(e) => {
                           if (firstMesTabIndex === -1) {
                               setFormData(prev => ({ ...prev, firstMessage: e.target.value }));
                           } else {
                               const newAlts = [...(formData.alternate_greetings || [])];
                               newAlts[firstMesTabIndex] = e.target.value;
                               setFormData(prev => ({ ...prev, alternate_greetings: newAlts }));
                           }
                       }}
                       className={`flex-1 w-full rounded-2xl px-6 py-5 text-sm leading-relaxed resize-none outline-none transition-all custom-scrollbar border
                           ${theme === 'light' ? 'bg-white border-slate-200 text-slate-800 focus:border-blue-400' : 'bg-white/5 border-white/10 text-gray-200 focus:border-white/30'}`}
                       placeholder={firstMesTabIndex === -1 ? '角色的主开场白...' : `备选开场白 #${firstMesTabIndex + 1}...`}
                   />
                   {/* 字符统计 */}
                   <div className={`text-right text-xs mt-2 font-mono ${theme === 'light' ? 'text-slate-400' : 'text-gray-600'}`}>
                       {firstMesTabIndex === -1
                           ? (formData.firstMessage?.length || 0)
                           : ((formData.alternate_greetings || [])[firstMesTabIndex]?.length || 0)} 字符
                   </div>
               </div>
           </div>
       )}

       {/* Fullscreen generic text editor (for other fields) */}
       {fullscreenField && (
           <Modal
               isOpen={!!fullscreenField}
               onClose={() => setFullscreenField(null)}
               title={fullscreenField.label}
               theme={theme}
               maxWidth="max-w-3xl"
           >
               <div className="flex flex-col gap-4">
                   <div className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>
                       {fullscreenField.value.length} 字符
                   </div>
                   <textarea
                       autoFocus
                       value={fullscreenField.value}
                       onChange={(e) => {
                           setFullscreenField(prev => prev ? { ...prev, value: e.target.value } : null);
                       }}
                       className={`w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all custom-scrollbar ${inputBg}`}
                       style={{ minHeight: '400px' }}
                   />
                   <div className="flex justify-end gap-3">
                       <Button variant="secondary" onClick={() => setFullscreenField(null)}>取消</Button>
                       <Button variant="primary" onClick={() => {
                           if (fullscreenField) {
                               setFormData(prev => ({ ...prev, [fullscreenField.key]: fullscreenField.value }));
                               setFullscreenField(null);
                           }
                       }}>保存</Button>
                   </div>
               </div>
           </Modal>
       )}
    </div>
  );
};

export default CharacterForm;