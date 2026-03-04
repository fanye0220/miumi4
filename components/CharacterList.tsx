import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Character, Theme } from '../types';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { Edit2, Trash2, Upload, AlertCircle, Download, FileText, AlertTriangle, QrCode, CheckSquare, Square, Filter, ChevronLeft, ChevronRight, ChevronDown, FolderInput, Book, MessageSquare, MoreVertical, FileJson, Image as ImageIcon, Check, Heart, Star, List, Tag, Menu, X, Plus, Copy, Folder, FolderPlus, GitCompare, StickyNote, Users, Globe, Search } from 'lucide-react';
import { parseCharacterCard, parseCharacterJson, exportCharacterData, exportBulkCharacters } from '../services/cardImportService';

// Removed invalid module augmentation. We will cast props if needed or ignore the error for now as it's just for directory upload.
// If needed, we can use a custom input component or just ignore the TS error on the input element locally.

interface CharacterListProps {
  characters: Character[];
  onSelect: (char: Character) => void;
  onDelete: (id: string) => void;
  onDeleteBatch?: (ids: string[]) => void;
  onImport: (char: Character) => void;
  onImportBatch?: (chars: Character[]) => void; // 批量导入，一次setState
  onUpdate?: (char: Character) => void;
  theme: Theme;
  folders?: string[];
  onCreateFolder?: (name: string) => void;
  onDeleteFolder?: (name: string) => void;
  onRenameFolder?: (oldName: string, newName: string) => void;
}

interface ImportResults {
  success: number;
  failed: number;
  failedFiles: string[];
}

const CharacterList: React.FC<CharacterListProps> = ({ 
  characters, 
  onSelect, 
  onDelete,
  onDeleteBatch,
  onImport,
  onImportBatch,
  onUpdate,
  theme
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [importingCount, setImportingCount] = useState(0);
  
  // Import Error Modal State
  const [importErrorModalOpen, setImportErrorModalOpen] = useState(false);
  const [importResults, setImportResults] = useState<ImportResults | null>(null);
  
  // Sidebar State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTagsExpanded, setIsTagsExpanded] = useState(true);
  const [isCollectionsExpanded, setIsCollectionsExpanded] = useState(true);
  const [activeFilter, setActiveFilter] = useState<{ type: 'all' | 'favorite' | 'tag' | 'duplicate' | 'collection', value?: string }>({ type: 'all' });

  // Resizable Sidebar State
  const [collectionsHeight, setCollectionsHeight] = useState(180);
  const [tagsHeight, setTagsHeight] = useState(180);
  const [resizingTarget, setResizingTarget] = useState<'collections' | 'tags' | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingTarget) return;
      
      if (resizingTarget === 'collections') {
          setCollectionsHeight(prev => {
              const newHeight = prev + e.movementY;
              return Math.max(50, Math.min(600, newHeight));
          });
      } else if (resizingTarget === 'tags') {
          setTagsHeight(prev => {
              const newHeight = prev + e.movementY;
              return Math.max(50, Math.min(600, newHeight));
          });
      }
    };

    const handleMouseUp = () => {
      setResizingTarget(null);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (resizingTarget) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingTarget]);

  // States
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportMenuCharId, setExportMenuCharId] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<'updated-desc' | 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc'>('updated-desc');
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Batch Edit Modal
  const [batchEditModalOpen, setBatchEditModalOpen] = useState(false);
  const [batchCreator, setBatchCreator] = useState('');
  const [batchTagsToAdd, setBatchTagsToAdd] = useState('');

  // First Message Preview Modal
  const [firstMesPreviewChar, setFirstMesPreviewChar] = useState<Character | null>(null);

  // World Info Modal
  const [wiModalChar, setWiModalChar] = useState<Character | null>(null);
  const [wiSelectedIndex, setWiSelectedIndex] = useState<number>(-1);
  
  // Tag & Collection Management
  const [customTags, setCustomTags] = useState<string[]>([]); // "Card Tags"
  const [collections, setCollections] = useState<string[]>(() => {
      try {
          const saved = localStorage.getItem('collections');
          return saved ? JSON.parse(saved) : [];
      } catch {
          return [];
      }
  });
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isAddingCollection, setIsAddingCollection] = useState(false);
  const [newTagInputValue, setNewTagInputValue] = useState('');
  const [newCollectionInputValue, setNewCollectionInputValue] = useState('');

  useEffect(() => {
      localStorage.setItem('collections', JSON.stringify(collections));
  }, [collections]);

  // Renaming State
  const [editingCollection, setEditingCollection] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleStartRenameCollection = (name: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingCollection(name);
      setRenameValue(name);
  };

  const handleFinishRenameCollection = () => {
      if (!editingCollection || !renameValue.trim()) {
          setEditingCollection(null);
          return;
      }
      const newName = renameValue.trim();
      if (newName !== editingCollection && !collections.includes(newName)) {
          setCollections(prev => prev.map(c => c === editingCollection ? newName : c));
          // Update characters
          characters.forEach(char => {
              const currentTags = Array.isArray(char.tags) ? char.tags : [];
              if (currentTags.includes(editingCollection)) {
                  const newTags = currentTags.map(t => t === editingCollection ? newName : t);
                  onUpdate?.({ ...char, tags: newTags });
              }
          });
          if (activeFilter.type === 'collection' && activeFilter.value === editingCollection) {
              setActiveFilter({ ...activeFilter, value: newName });
          }
      }
      setEditingCollection(null);
  };

  const handleStartRenameTag = (tag: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingTag(tag);
      setRenameValue(tag);
  };

  const handleFinishRenameTag = () => {
      if (!editingTag || !renameValue.trim()) {
          setEditingTag(null);
          return;
      }
      const newName = renameValue.trim();
      if (newName !== editingTag && !allTags.includes(newName)) {
          // Update custom tags list if it's there
          setCustomTags(prev => prev.map(t => t === editingTag ? newName : t));
          
          // Update characters
          characters.forEach(char => {
              const currentTags = Array.isArray(char.tags) ? char.tags : [];
              if (currentTags.includes(editingTag)) {
                  const newTags = currentTags.map(t => t === editingTag ? newName : t);
                  onUpdate?.({ ...char, tags: newTags });
              }
          });
          
          if (activeFilter.type === 'tag' && activeFilter.value === editingTag) {
              setActiveFilter({ ...activeFilter, value: newName });
          }
      }
      setEditingTag(null);
  };
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [jumpPage, setJumpPage] = useState('');

  useEffect(() => {
    setCurrentPage(1);
  }, [characters.length, itemsPerPage, sortOption, activeFilter, searchQuery]);

  // Compute unique tags (excluding collections)
  const allTags = useMemo(() => {
    const tags = new Set<string>(customTags);
    characters.forEach(c => {
      const currentTags = Array.isArray(c.tags) ? c.tags : [];
      currentTags.forEach(t => {
          if (!collections.includes(t)) {
              tags.add(t);
          }
      });
    });
    return Array.from(tags).sort();
  }, [characters, customTags, collections]);

  const duplicateIds = useMemo(() => {
    const seenNames = new Map<string, string[]>();
    const ids = new Set<string>();
    
    characters.forEach(c => {
        const existing = seenNames.get(c.name) || [];
        seenNames.set(c.name, [...existing, c.id]);
    });

    seenNames.forEach((idsList) => {
        if (idsList.length > 1) {
            idsList.forEach(id => ids.add(id));
        }
    });
    return ids;
  }, [characters]);

  const filteredCharacters = useMemo(() => {
    let result = characters;
    
    // Apply search
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        result = result.filter(c => 
            c.name.toLowerCase().includes(q) ||
            c.description?.toLowerCase().includes(q) ||
            c.originalFilename?.toLowerCase().includes(q) ||
            (Array.isArray(c.tags) ? c.tags : []).some(t => t.toLowerCase().includes(q))
        );
    }
    
    // Apply Active Filter
    if (activeFilter.type === 'favorite') {
        result = result.filter(c => c.isFavorite);
    } else if (activeFilter.type === 'tag' && activeFilter.value) {
        result = result.filter(c => (Array.isArray(c.tags) ? c.tags : []).includes(activeFilter.value!));
    } else if (activeFilter.type === 'collection' && activeFilter.value) {
        result = result.filter(c => (Array.isArray(c.tags) ? c.tags : []).includes(activeFilter.value!));
    } else if (activeFilter.type === 'duplicate') {
        result = result.filter(c => duplicateIds.has(c.id));
    }
    
    // Sorting
    return [...result].sort((a, b) => {
        if (sortOption === 'updated-desc') {
            return (b.updatedAt || b.importDate || 0) - (a.updatedAt || a.importDate || 0);
        } else if (sortOption === 'date-desc') {
            return (b.importDate || 0) - (a.importDate || 0);
        } else if (sortOption === 'date-asc') {
            return (a.importDate || 0) - (b.importDate || 0);
        } else if (sortOption === 'name-asc') {
            return a.name.localeCompare(b.name);
        } else if (sortOption === 'name-desc') {
            return b.name.localeCompare(a.name);
        }
        return 0;
    });
  }, [characters, duplicateIds, sortOption, activeFilter]);

  const groupedCharacters = useMemo<Record<string, Character[]> | null>(() => {
    if (activeFilter.type !== 'duplicate') return null;
    const groups: Record<string, Character[]> = {};
    filteredCharacters.forEach(c => {
      if (!groups[c.name]) groups[c.name] = [];
      groups[c.name].push(c);
    });
    return groups;
  }, [filteredCharacters, activeFilter]);

  const displayCharacters = useMemo(() => {
    if (activeFilter.type === 'duplicate') return []; // Not used in grouped mode
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredCharacters.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredCharacters, currentPage, itemsPerPage, activeFilter]);

  const totalPages = Math.ceil(filteredCharacters.length / itemsPerPage);

  const renderCharacterCard = (char: Character) => {
    const isDuplicate = duplicateIds.has(char.id);
    const hasQr = char.qrList && char.qrList.length > 0;
    const hasWorldInfo = !!(char.character_book?.entries && char.character_book.entries.length > 0);
    const isSelected = selectedIds.has(char.id);

    return (
        <div 
            key={char.id} 
            onClick={() => {
                if (isSelectionMode) toggleSelection(char.id);
                else onSelect(char);
            }}
            className={`
                flex flex-col h-[500px] rounded-[24px] overflow-hidden relative group transition-all duration-300
                ${theme === 'light' 
                    ? 'bg-white shadow-lg hover:shadow-xl border border-slate-200' 
                    : 'bg-[#1a1b1e] shadow-xl hover:shadow-2xl border border-white/10'
                }
                ${isSelected ? 'transform scale-[0.98] border-blue-500/50' : 'hover:-translate-y-1'}
                cursor-pointer
                ${isDuplicate && activeFilter.type !== 'duplicate' && theme === 'dark' ? 'border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.1)]' : ''} 
                ${isDuplicate && activeFilter.type !== 'duplicate' && theme === 'light' ? 'border-yellow-400 shadow-md' : ''}
            `}
        >
        
        {/* Image Section (Top 65%) */}
        <div className="h-[65%] w-full relative overflow-hidden bg-gray-900">
             <img 
                src={char.avatarUrl} 
                alt={char.name} 
                className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
                loading="lazy" 
            />
            {/* Dark gradient overlay */}
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
            
            {/* Hover Action Buttons (top right) */}
            {!isSelectionMode && (
                <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-20">
                    <button
                        onClick={(e) => { e.stopPropagation(); onUpdate?.({ ...char, isFavorite: !char.isFavorite }); }}
                        className={`w-8 h-8 rounded-lg backdrop-blur-sm flex items-center justify-center transition-colors shadow-lg ${char.isFavorite ? 'bg-pink-500/80 text-white' : 'bg-black/60 text-white hover:bg-pink-500/80'}`}
                        title={char.isFavorite ? '取消收藏' : '收藏'}
                    >
                        <Heart size={14} fill={char.isFavorite ? 'currentColor' : 'none'} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDuplicateCard(char); }}
                        className="w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-blue-500/80 transition-colors shadow-lg"
                        title="复制卡片"
                    >
                        <Copy size={14} />
                    </button>
                    {hasWorldInfo && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setWiModalChar(char); setWiSelectedIndex(0); }}
                            className="w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-yellow-500/80 transition-colors shadow-lg"
                            title="查看世界书"
                        >
                            <Book size={14} />
                        </button>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); setFirstMesPreviewChar(char); }}
                        className="w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-green-500/80 transition-colors shadow-lg"
                        title="查看开场白"
                    >
                        <MessageSquare size={14} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(char.id); }}
                        className="w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-red-500/80 transition-colors shadow-lg"
                        title="删除"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            )}
            {/* 常驻收藏❤️标记（左上角，已收藏时显示） */}
            {char.isFavorite && (
                <div className="absolute top-2 left-2 z-10">
                    <div className="w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center shadow-lg shadow-pink-500/40">
                        <Heart size={11} fill="white" className="text-white" />
                    </div>
                </div>
            )}
        </div>

        {/* Content Section */}
        <div className="flex-1 p-4 flex flex-col relative">
            <div className="flex gap-1 mb-1">
                 {isDuplicate && activeFilter.type !== 'duplicate' && <AlertTriangle size={12} className="text-yellow-500"/>}
            </div>

            <div className="mb-2">
                <div className="flex items-center gap-2 mb-1">
                    <h3 className={`text-lg font-bold truncate leading-tight ${theme === 'light' ? 'text-gray-900' : 'text-gray-100'}`} title={char.name}>
                        {char.name}
                    </h3>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        {hasQr && <QrCode size={14} className="text-green-500" title="包含快速回复配置" />}
                        {hasWorldInfo && <Book size={14} className="text-yellow-500" title="包含世界书" />}
                        {char.note && <StickyNote size={14} className="text-blue-400" title="有备注" />}
                    </div>
                </div>
                <div className={`flex items-center gap-1.5 text-[11px] font-medium truncate ${theme === 'light' ? 'text-gray-400' : 'text-gray-500'}`} title={char.originalFilename || "Local"}>
                    <FileText size={10} />
                    {char.originalFilename || "local_card.png"}
                </div>
            </div>

            <div className={`h-[90px] shrink-0 rounded-xl p-3 flex flex-col gap-1.5 ${theme === 'light' ? 'bg-gray-50' : 'bg-white/5'}`}>
                 <div className="flex justify-between items-center">
                     <span className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'light' ? 'text-gray-400' : 'text-gray-500'}`}>
                         FIRST MESSAGE
                     </span>
                     <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 ${theme === 'light' ? 'bg-white text-gray-400 shadow-sm' : 'bg-black/20 text-gray-500'}`}>
                         <MessageSquare size={8} /> 
                         <span>{char.firstMessage?.length || 0}</span>
                     </div>
                 </div>
                 <p className={`text-[11px] line-clamp-4 leading-relaxed ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                     {char.firstMessage || "..."}
                 </p>
            </div>

            {/* Export buttons row */}
            {!isSelectionMode && (
                <div className="absolute bottom-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleSingleExport(char, 'png'); }}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                        title="导出 PNG"
                    >
                        PNG
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleSingleExport(char, 'json'); }}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                        title="导出 JSON"
                    >
                        JSON
                    </button>
                </div>
            )}
        </div>

        {/* Selection Overlay (Ring Only) */}
        {isSelected && (
            <div className="absolute inset-0 border-[3px] border-blue-500 rounded-[24px] pointer-events-none z-30"></div>
        )}
        </div>
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setWarning(null);
    
    const fileArray = Array.from(files) as File[];
    const validFiles = fileArray.filter(f => {
      const name = f.name.toLowerCase();
      return name.endsWith('.png') || name.endsWith('.json');
    });
    if (validFiles.length === 0) return;

    setImportingCount(validFiles.length);

    let successCount = 0;
    let failCount = 0;
    const failedFiles: string[] = [];

    // 流式批处理：每 BATCH_SIZE 张解析完就调用一次 onImportBatch
    // 这样 React 只触发一次 setState，不会因为 N 次连续 setState 积压渲染
    const BATCH_SIZE = 15;
    let batch: Character[] = [];

    const flushBatch = () => {
      if (batch.length === 0) return;
      const toFlush = batch.splice(0); // 清空 batch
      if (onImportBatch) {
        onImportBatch(toFlush);
      } else {
        toFlush.forEach(c => onImport(c));
      }
    };

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const isPng = file.name.toLowerCase().endsWith('.png');
      try {
        const char = isPng ? await parseCharacterCard(file) : await parseCharacterJson(file);

        if (validFiles.length === 1) {
          const isDuplicateName = characters.some(c => c.name === char.name);
          if (isDuplicateName) setWarning(`注意：检测到可能重复的角色 "${char.name}"`);
        }

        batch.push(char);
        successCount++;

        // 每攒够一批就提交，然后让出主线程
        if (batch.length >= BATCH_SIZE) {
          flushBatch();
          setImportingCount(validFiles.length - i - 1); // 更新进度
          // 让出主线程：让浏览器渲染这一批，再继续解析下一批
          await new Promise(r => setTimeout(r, 16));
        }
      } catch (err: any) {
        console.error(`Failed to import ${file.name}:`, err);
        failCount++;
        failedFiles.push(`${file.name}: ${err.message}`);
      }
    }

    // 提交最后一批剩余
    flushBatch();
    setImportingCount(0);

    if (failCount > 0) {
      setImportResults({ success: successCount, failed: failCount, failedFiles });
      setImportErrorModalOpen(true);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCharacters.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredCharacters.map(c => c.id)));
  };

  const toggleSelectAllPage = () => {
    const currentList = activeFilter.type === 'duplicate' ? filteredCharacters : displayCharacters;
    const newSet = new Set(selectedIds);
    const allPageSelected = currentList.length > 0 && currentList.every(c => newSet.has(c.id));
    if (allPageSelected) {
        currentList.forEach(c => newSet.delete(c.id));
    } else {
        currentList.forEach(c => newSet.add(c.id));
    }
    setSelectedIds(newSet);
  };

  const handleBulkExport = async () => {
    const selectedChars = characters.filter(c => selectedIds.has(c.id));
    if (selectedChars.length === 0) return;
    try {
        await exportBulkCharacters(selectedChars, collections);
        setIsSelectionMode(false);
        setSelectedIds(new Set());
    } catch (e: any) {
        setError("批量导出失败: " + e.message);
    }
  };

  const handleSingleExport = async (char: Character, format: 'json' | 'png') => {
    setExportMenuCharId(null);
    
    // Check if trying to export PNG from a JSON-imported character (or one without a proper avatar)
    if (format === 'png' && char.importFormat === 'json') {
        // We can check if the avatar is a blob URL (which means they uploaded one) or a picsum URL (placeholder)
        // If it's a placeholder, we should definitely warn.
        if (char.avatarUrl.includes('picsum.photos')) {
             if (!window.confirm("该角色是通过 JSON 导入的，且似乎没有上传自定义头像（当前是随机占位图）。\n导出 PNG 会将数据嵌入到这张占位图中。\n\n确定要继续吗？建议先在编辑页面上传一张图片。")) {
                 return;
             }
        }
    }

    try {
      await exportCharacterData(char, format);
    } catch (err) {
      console.error("Export failed", err);
      setError("导出失败");
    }
  };

  const handleAddTag = () => {
    const tag = newTagInputValue.trim();
    if (tag && !allTags.includes(tag) && !collections.includes(tag)) {
        setCustomTags(prev => [...prev, tag]);
        setNewTagInputValue('');
        setIsAddingTag(false);
    }
  };

  const handleAddCollection = () => {
      const name = newCollectionInputValue.trim();
      if (name && !collections.includes(name) && !allTags.includes(name)) {
          setCollections(prev => [...prev, name]);
          setNewCollectionInputValue('');
          setIsAddingCollection(false);
      }
  };

  const handleDeleteCollection = (name: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm(`确定要删除收藏夹 "${name}" 吗? 这将从所有角色中移除此标签。`)) return;
      
      setCollections(prev => prev.filter(c => c !== name));
      
      // Remove tag from characters
      characters.forEach(char => {
          const currentTags = Array.isArray(char.tags) ? char.tags : [];
          if (currentTags.includes(name)) {
              const newTags = currentTags.filter(t => t !== name);
              onUpdate?.({ ...char, tags: newTags });
          }
      });

      if (activeFilter.type === 'collection' && activeFilter.value === name) {
          setActiveFilter({ type: 'all' });
      }
  };

  const handleDeleteTag = (tagToDelete: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm(`确定要删除标签 "${tagToDelete}" 吗? 这将从所有角色中移除此标签。`)) return;
      
      // Remove from custom tags
      setCustomTags(prev => prev.filter(t => t !== tagToDelete));
      
      // Remove from all characters
      characters.forEach(char => {
          const currentTags = Array.isArray(char.tags) ? char.tags : [];
          if (currentTags.includes(tagToDelete)) {
              const newTags = currentTags.filter(t => t !== tagToDelete);
              onUpdate?.({ ...char, tags: newTags });
          }
      });
      
      if (activeFilter.type === 'tag' && activeFilter.value === tagToDelete) {
          setActiveFilter({ type: 'all' });
      }
  };

  const handleDuplicateCard = (char: Character) => {
    const newChar: Character = {
        ...char,
        id: crypto.randomUUID(),
        name: char.name + ' (副本)',
        importDate: Date.now(),
        updatedAt: Date.now(),
        originalFilename: char.originalFilename ? char.originalFilename.replace(/(\.[^/.]+)?$/, '_copy$1') : undefined,
    };
    onImport(newChar);
  };

  const handleBatchEdit = () => {
    if (selectedIds.size === 0) return;
    const targets = characters.filter(c => selectedIds.has(c.id));
    const newTags = batchTagsToAdd.split(/[,，]/).map(t => t.trim()).filter(t => t);
    targets.forEach(char => {
        const updatedChar = { ...char, updatedAt: Date.now() };
        if (batchCreator.trim()) {
            updatedChar.creator_notes = batchCreator.trim();
        }
        if (newTags.length > 0) {
            const existingTags = Array.isArray(char.tags) ? char.tags : [];
            updatedChar.tags = Array.from(new Set([...existingTags, ...newTags]));
        }
        onUpdate?.(updatedChar);
    });
    setBatchEditModalOpen(false);
    setBatchCreator('');
    setBatchTagsToAdd('');
  };

  const handleExportCollection = async (collectionName: string) => {
    const collectionChars = characters.filter(c => (Array.isArray(c.tags) ? c.tags : []).includes(collectionName));
    if (collectionChars.length === 0) {
        alert(`收藏夹 "${collectionName}" 没有角色卡片`);
        return;
    }
    try {
        await exportBulkCharacters(collectionChars, [collectionName]);
    } catch (e: any) {
        setError('导出收藏夹失败: ' + e.message);
    }
  };

  const handleExportAll = async () => {
    if (characters.length === 0) return;
    try {
        await exportBulkCharacters(characters, collections);
    } catch (e: any) {
        setError('批量导出失败: ' + e.message);
    }
  };


  const textColor = theme === 'light' ? 'text-slate-800' : 'text-white';
  const subTextColor = theme === 'light' ? 'text-slate-500' : 'text-blue-200/70';
  const buttonBase = theme === 'light' 
    ? 'bg-white/50 hover:bg-white/80 border-slate-200 text-slate-700 shadow-sm' 
    : 'bg-white/10 hover:bg-white/20 border-white/20 text-white shadow-lg';
  const activeFilterClass = theme === 'light' 
    ? 'bg-blue-100 border-blue-300 text-blue-700' 
    : 'bg-blue-500/30 border-blue-400 text-white';

  return (
    <div className="w-full max-w-[1600px] mx-auto animate-fade-in relative flex h-full gap-6">
      
      {/* Sidebar */}
      <div className={`transition-all duration-300 flex flex-col shrink-0 ${isSidebarOpen ? 'w-64 opacity-100' : 'w-0 opacity-0 overflow-hidden'}`}>
          <div className={`flex-1 rounded-2xl p-4 flex flex-col gap-2 ${theme === 'light' ? 'bg-white/50 border border-slate-200' : 'bg-black/20 border border-white/10'}`}>
              
              {/* All Characters */}
              <button 
                  onClick={() => setActiveFilter({ type: 'all' })}
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold flex items-center gap-3 transition-all duration-300 group ${
                      activeFilter.type === 'all' 
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.02]' 
                          : (theme === 'light' ? 'hover:bg-white/60 text-slate-600 hover:shadow-sm' : 'hover:bg-white/10 text-gray-400')
                  }`}
              >
                  <List size={18} className={activeFilter.type === 'all' ? 'text-white' : ''} />
                  <span>全部角色</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                      activeFilter.type === 'all' 
                          ? 'bg-white/20 text-white' 
                          : 'bg-black/5 text-slate-400 group-hover:bg-black/10'
                  }`}>
                      {characters.length}
                  </span>
              </button>

              {/* Duplicates */}
              <button 
                  onClick={() => setActiveFilter({ type: 'duplicate' })}
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold flex items-center gap-3 transition-all duration-300 group ${
                      activeFilter.type === 'duplicate' 
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.02]' 
                          : (theme === 'light' ? 'hover:bg-white/60 text-slate-600 hover:shadow-sm' : 'hover:bg-white/10 text-gray-400')
                  }`}
              >
                  <Copy size={18} className={activeFilter.type === 'duplicate' ? 'text-white' : ''} />
                  <span>重复角色</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                      activeFilter.type === 'duplicate' 
                          ? 'bg-white/20 text-white' 
                          : 'bg-black/5 text-slate-400 group-hover:bg-black/10'
                  }`}>
                      {duplicateIds.size}
                  </span>
              </button>

              {/* Favorites */}
              <button 
                  onClick={() => setActiveFilter({ type: 'favorite' })}
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold flex items-center gap-3 transition-all duration-300 group ${
                      activeFilter.type === 'favorite' 
                          ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-500/30 scale-[1.02]' 
                          : (theme === 'light' ? 'hover:bg-white/60 text-slate-600 hover:shadow-sm' : 'hover:bg-white/10 text-gray-400')
                  }`}
              >
                  <Heart size={18} className={activeFilter.type === 'favorite' ? 'text-white' : ''} />
                  <span>我的收藏</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                      activeFilter.type === 'favorite' 
                          ? 'bg-white/20 text-white' 
                          : 'bg-black/5 text-slate-400 group-hover:bg-black/10'
                  }`}>
                      {characters.filter(c => c.isFavorite).length}
                  </span>
              </button>

              <div className={`h-px my-3 mx-2 ${theme === 'light' ? 'bg-slate-200/60' : 'bg-white/5'}`}></div>

              {/* Collections Header */}
              <div className={`w-full px-2 py-2 flex items-center justify-between`}>
                  <button 
                      onClick={() => setIsCollectionsExpanded(!isCollectionsExpanded)}
                      className={`flex-1 text-left font-bold text-xs uppercase tracking-wider flex items-center gap-2 ${theme === 'light' ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                      <Folder size={14} />
                      <span>收藏夹 ({collections.length})</span>
                      {isCollectionsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <button 
                      onClick={() => setIsAddingCollection(!isAddingCollection)}
                      className={`p-1 rounded-md transition-colors ${theme === 'light' ? 'hover:bg-slate-200 text-slate-400 hover:text-slate-600' : 'hover:bg-white/10 text-gray-500 hover:text-gray-300'}`}
                      title="新建收藏夹"
                  >
                      <FolderPlus size={14} />
                  </button>
              </div>

              {/* Collections List */}
              <div 
                  className={`overflow-y-auto custom-scrollbar space-y-1 transition-all duration-300 mb-2 shrink-0 ${isCollectionsExpanded ? 'opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}
                  style={isCollectionsExpanded ? { maxHeight: `${collectionsHeight}px` } : {}}
              >
                  {isAddingCollection && (
                      <div className="px-2 mb-2">
                          <input
                              autoFocus
                              type="text"
                              value={newCollectionInputValue}
                              onChange={(e) => setNewCollectionInputValue(e.target.value)}
                              onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddCollection();
                                  if (e.key === 'Escape') setIsAddingCollection(false);
                              }}
                              onBlur={() => {
                                  if (newCollectionInputValue.trim()) handleAddCollection();
                                  else setIsAddingCollection(false);
                              }}
                              placeholder="收藏夹名称..."
                              className={`w-full px-3 py-2 rounded-xl text-sm outline-none border ${theme === 'light' ? 'bg-white border-blue-500 text-slate-800' : 'bg-black/40 border-blue-500 text-white'}`}
                          />
                      </div>
                  )}
                  {collections.map(name => (
                      <div key={name} className="relative group">
                          {editingCollection === name ? (
                              <input
                                  autoFocus
                                  type="text"
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleFinishRenameCollection();
                                      if (e.key === 'Escape') setEditingCollection(null);
                                  }}
                                  onBlur={handleFinishRenameCollection}
                                  className={`w-full px-3 py-2 rounded-xl text-sm outline-none border ${theme === 'light' ? 'bg-white border-blue-500 text-slate-800' : 'bg-black/40 border-blue-500 text-white'}`}
                              />
                          ) : (
                              <button
                                  onClick={() => setActiveFilter({ type: 'collection', value: name })}
                                  onDoubleClick={(e) => handleStartRenameCollection(name, e)}
                                  className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all group relative ${activeFilter.type === 'collection' && activeFilter.value === name ? (theme === 'light' ? 'bg-slate-200 text-slate-900' : 'bg-white/20 text-white') : (theme === 'light' ? 'hover:bg-white/50 text-slate-500' : 'hover:bg-white/5 text-gray-400')}`}
                              >
                                  <Folder size={14} className="opacity-70" />
                                  <span className="truncate flex-1">{name}</span>
                                  <span className="text-[10px] opacity-50 group-hover:opacity-0 transition-opacity">{characters.filter(c => (Array.isArray(c.tags) ? c.tags : []).includes(name)).length}</span>
                                  
                                  {/* Actions */}
                                  <div className={`absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all`}>
                                      <div 
                                          onClick={(e) => { e.stopPropagation(); handleExportCollection(name); }}
                                          className={`p-1.5 rounded-lg ${theme === 'light' ? 'hover:bg-green-100 text-green-500' : 'hover:bg-green-500/20 text-green-400'}`}
                                          title="导出收藏夹"
                                      >
                                          <Download size={12} />
                                      </div>
                                      <div 
                                          onClick={(e) => handleStartRenameCollection(name, e)}
                                          className={`p-1.5 rounded-lg ${theme === 'light' ? 'hover:bg-blue-100 text-blue-400' : 'hover:bg-blue-500/20 text-blue-400'}`}
                                          title="重命名"
                                      >
                                          <Edit2 size={12} />
                                      </div>
                                      <div 
                                          onClick={(e) => handleDeleteCollection(name, e)}
                                          className={`p-1.5 rounded-lg ${theme === 'light' ? 'hover:bg-red-100 text-red-400' : 'hover:bg-red-500/20 text-red-400'}`}
                                          title="删除"
                                      >
                                          <Trash2 size={12} />
                                      </div>
                                  </div>
                              </button>
                          )}
                      </div>
                  ))}
                  {collections.length === 0 && !isAddingCollection && (
                      <div className={`text-center py-4 text-xs ${theme === 'light' ? 'text-slate-400' : 'text-gray-600'}`}>
                          暂无收藏夹
                      </div>
                  )}
              </div>

              {/* Resize Handle for Collections */}
              <div 
                  className={`h-1.5 my-1 mx-2 shrink-0 cursor-row-resize flex items-center justify-center group transition-colors rounded-full ${resizingTarget === 'collections' ? 'bg-blue-500/50' : (theme === 'light' ? 'hover:bg-slate-200' : 'hover:bg-white/10')}`}
                  onMouseDown={(e) => {
                      e.preventDefault();
                      setResizingTarget('collections');
                  }}
              >
                  <div className={`w-8 h-1 rounded-full transition-colors ${resizingTarget === 'collections' ? 'bg-blue-500' : (theme === 'light' ? 'bg-slate-300 group-hover:bg-slate-400' : 'bg-white/20 group-hover:bg-white/40')}`}></div>
              </div>

              {/* Tags Header */}
              <div className={`w-full px-2 py-2 flex items-center justify-between shrink-0`}>
                  <button 
                      onClick={() => setIsTagsExpanded(!isTagsExpanded)}
                      className={`flex-1 text-left font-bold text-xs uppercase tracking-wider flex items-center gap-2 ${theme === 'light' ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                      <Tag size={14} />
                      <span>标签 ({allTags.length})</span>
                      {isTagsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <button 
                      onClick={() => setIsAddingTag(!isAddingTag)}
                      className={`p-1 rounded-md transition-colors ${theme === 'light' ? 'hover:bg-slate-200 text-slate-400 hover:text-slate-600' : 'hover:bg-white/10 text-gray-500 hover:text-gray-300'}`}
                      title="Add Tag"
                  >
                      <Plus size={14} />
                  </button>
              </div>

              {/* Tags List */}
              <div 
                  className={`min-h-0 overflow-y-auto custom-scrollbar space-y-1 transition-all duration-300 shrink-0 ${isTagsExpanded ? 'opacity-100' : 'h-0 opacity-0 overflow-hidden'}`}
                  style={isTagsExpanded ? { height: `${tagsHeight}px` } : {}}
              >
                  {isAddingTag && (
                      <div className="px-2 mb-2">
                          <input
                              autoFocus
                              type="text"
                              value={newTagInputValue}
                              onChange={(e) => setNewTagInputValue(e.target.value)}
                              onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddTag();
                                  if (e.key === 'Escape') setIsAddingTag(false);
                              }}
                              onBlur={() => {
                                  if (newTagInputValue.trim()) handleAddTag();
                                  else setIsAddingTag(false);
                              }}
                              placeholder="New tag..."
                              className={`w-full px-3 py-2 rounded-xl text-sm outline-none border ${theme === 'light' ? 'bg-white border-blue-500 text-slate-800' : 'bg-black/40 border-blue-500 text-white'}`}
                          />
                      </div>
                  )}
                  {allTags.map(tag => (
                      <div key={tag} className="relative group">
                          {editingTag === tag ? (
                              <input
                                  autoFocus
                                  type="text"
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleFinishRenameTag();
                                      if (e.key === 'Escape') setEditingTag(null);
                                  }}
                                  onBlur={handleFinishRenameTag}
                                  className={`w-full px-3 py-2 rounded-xl text-sm outline-none border ${theme === 'light' ? 'bg-white border-blue-500 text-slate-800' : 'bg-black/40 border-blue-500 text-white'}`}
                              />
                          ) : (
                              <button
                                  onClick={() => setActiveFilter({ type: 'tag', value: tag })}
                                  onDoubleClick={(e) => handleStartRenameTag(tag, e)}
                                  className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all group relative ${activeFilter.type === 'tag' && activeFilter.value === tag ? (theme === 'light' ? 'bg-slate-200 text-slate-900' : 'bg-white/20 text-white') : (theme === 'light' ? 'hover:bg-white/50 text-slate-500' : 'hover:bg-white/5 text-gray-400')}`}
                              >
                                  <span className="truncate flex-1"># {tag}</span>
                                  <span className="text-[10px] opacity-50 group-hover:opacity-0 transition-opacity">{characters.filter(c => (Array.isArray(c.tags) ? c.tags : []).includes(tag)).length}</span>
                                  
                                  {/* Actions */}
                                  <div className={`absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all`}>
                                      <div 
                                          onClick={(e) => handleStartRenameTag(tag, e)}
                                          className={`p-1.5 rounded-lg ${theme === 'light' ? 'hover:bg-blue-100 text-blue-400' : 'hover:bg-blue-500/20 text-blue-400'}`}
                                          title="重命名"
                                      >
                                          <Edit2 size={12} />
                                      </div>
                                      <div 
                                          onClick={(e) => handleDeleteTag(tag, e)}
                                          className={`p-1.5 rounded-lg ${theme === 'light' ? 'hover:bg-red-100 text-red-400' : 'hover:bg-red-500/20 text-red-400'}`}
                                          title="删除"
                                      >
                                          <Trash2 size={12} />
                                      </div>
                                  </div>
                              </button>
                          )}
                      </div>
                  ))}
                  {allTags.length === 0 && !isAddingTag && (
                      <div className={`text-center py-4 text-xs ${theme === 'light' ? 'text-slate-400' : 'text-gray-600'}`}>
                          暂无标签
                      </div>
                  )}
              </div>

              {/* Resize Handle for Tags */}
              <div 
                  className={`h-1.5 my-1 mx-2 shrink-0 cursor-row-resize flex items-center justify-center group transition-colors rounded-full ${resizingTarget === 'tags' ? 'bg-blue-500/50' : (theme === 'light' ? 'hover:bg-slate-200' : 'hover:bg-white/10')}`}
                  onMouseDown={(e) => {
                      e.preventDefault();
                      setResizingTarget('tags');
                  }}
              >
                  <div className={`w-8 h-1 rounded-full transition-colors ${resizingTarget === 'tags' ? 'bg-blue-500' : (theme === 'light' ? 'bg-slate-300 group-hover:bg-slate-400' : 'bg-white/20 group-hover:bg-white/40')}`}></div>
              </div>

              {/* Spacer to fill remaining space */}
              <div className="flex-1 min-h-0"></div>
          </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full min-w-0">
      {/* Header Controls */}
      <div className="flex flex-col xl:flex-row justify-between items-end mb-4 px-2 gap-4 shrink-0">
        <div className="flex items-center gap-4">
           <button 
               onClick={() => setIsSidebarOpen(!isSidebarOpen)}
               className={`p-2 rounded-xl transition-colors ${theme === 'light' ? 'bg-white/50 hover:bg-white text-slate-600' : 'bg-white/5 hover:bg-white/10 text-gray-300'}`}
           >
               {isSidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
           </button>
           <div>
               <h1 className={`text-2xl font-bold mb-1 tracking-tight drop-shadow-sm ${textColor}`}>
                   {activeFilter.type === 'all' && '全部角色'}
                   {activeFilter.type === 'tag' && `# ${activeFilter.value}`}
                   {activeFilter.type === 'collection' && `${activeFilter.value}`}
                   {activeFilter.type === 'duplicate' && '重复角色'}
               </h1>
               <p className={`text-xs ${subTextColor}`}>
                   {activeFilter.type === 'all' && `共 ${characters.length} 张卡片`}
                   {activeFilter.type === 'tag' && `标签 "${activeFilter.value}" 下共 ${characters.filter(c => (Array.isArray(c.tags) ? c.tags : []).includes(activeFilter.value!)).length} 张卡片`}
                   {activeFilter.type === 'collection' && `收藏夹 "${activeFilter.value}" 下共 ${characters.filter(c => (Array.isArray(c.tags) ? c.tags : []).includes(activeFilter.value!)).length} 张卡片`}
                   {activeFilter.type === 'duplicate' && `共 ${duplicateIds.size} 张重复卡片`}
               </p>
           </div>
        </div>
        
        <div className="flex flex-wrap gap-2 items-center justify-end w-full xl:w-auto">
            {/* Search Box */}
            <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-full text-xs font-medium backdrop-blur-sm ${buttonBase}`}>
                <Search size={12} className="opacity-50" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索角色..."
                    className="bg-transparent border-none outline-none w-28 font-medium"
                />
                {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="opacity-50 hover:opacity-100">
                        <X size={12} />
                    </button>
                )}
            </div>

            <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-full text-xs font-medium backdrop-blur-sm ${buttonBase}`}>
                <span className="opacity-70">排序:</span>
                <select 
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as any)}
                    className="bg-transparent border-none outline-none cursor-pointer font-bold appearance-none"
                    style={{ textAlignLast: 'center' }}
                >
                    <option value="updated-desc" className="text-black">最近修改</option>
                    <option value="date-desc" className="text-black">最新导入</option>
                    <option value="date-asc" className="text-black">最早导入</option>
                    <option value="name-asc" className="text-black">名称 A-Z</option>
                    <option value="name-desc" className="text-black">名称 Z-A</option>
                </select>
                <ChevronDown size={10} className="opacity-50"/>
            </div>

            <button
                onClick={() => {
                    setIsSelectionMode(!isSelectionMode);
                    setSelectedIds(new Set());
                }}
                className={`flex items-center gap-2 px-3 py-1.5 border rounded-full text-xs font-medium backdrop-blur-sm transition-all ${isSelectionMode ? activeFilterClass : buttonBase}`}
            >
                <CheckSquare size={12} />
                {isSelectionMode ? '取消' : '多选'}
            </button>

            <input type="file" accept="image/png,application/json" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            {/* @ts-ignore */}
            <input type="file" webkitdirectory="" directory="" multiple className="hidden" ref={folderInputRef} onChange={handleFileChange} />

            <div className="flex gap-1">
                <button 
                    onClick={() => folderInputRef.current?.click()}
                    disabled={importingCount > 0}
                    className={`flex items-center gap-2 px-4 py-1.5 border rounded-l-full font-medium backdrop-blur-sm transition-all hover:brightness-110 text-xs ${buttonBase}`}
                    title="导入整个文件夹"
                >
                    <FolderInput size={14} /> 文件夹
                </button>
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importingCount > 0}
                    className={`flex items-center gap-2 px-4 py-1.5 border rounded-r-full font-medium backdrop-blur-sm transition-all hover:brightness-110 text-xs border-l-0 ${buttonBase}`}
                    title="导入文件"
                >
                    <Upload size={14} /> 文件
                </button>
            </div>

            <button
                onClick={handleExportAll}
                disabled={characters.length === 0}
                className={`flex items-center gap-2 px-3 py-1.5 border rounded-full text-xs font-medium backdrop-blur-sm transition-all hover:brightness-110 disabled:opacity-40 ${buttonBase}`}
                title="导出全部角色"
            >
                <Download size={12} /> 导出全部
            </button>

             {importingCount > 0 && (
                <div className="flex items-center gap-2 text-xs text-blue-400 animate-pulse">
                    <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}
        </div>
      </div>
      
      {/* Bulk Action Bar */}
      {isSelectionMode && (
          <div className={`mb-4 mx-2 p-3 rounded-2xl flex items-center justify-between backdrop-blur-xl shadow-lg border animate-slide-down z-20 ${
              theme === 'light' 
                  ? 'bg-blue-50/90 border-blue-100 text-blue-900' 
                  : 'bg-blue-900/20 border-blue-500/20 text-blue-100'
          }`}>
             <div className="flex items-center gap-4 px-2">
                 <div className="flex items-center gap-3">
                     {activeFilter.type !== 'duplicate' && (
                         <button onClick={toggleSelectAllPage} className="flex items-center gap-2 text-sm font-bold hover:opacity-80 transition-opacity">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                displayCharacters.length > 0 && displayCharacters.every(c => selectedIds.has(c.id))
                                    ? 'bg-blue-500 border-blue-500 text-white'
                                    : 'bg-transparent border-current'
                            }`}>
                                {displayCharacters.length > 0 && displayCharacters.every(c => selectedIds.has(c.id)) && <Check size={14} strokeWidth={3} />}
                            </div>
                            全选本页
                         </button>
                     )}
                     <button onClick={toggleSelectAll} className="flex items-center gap-2 text-sm font-bold hover:opacity-80 transition-opacity">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                            selectedIds.size === filteredCharacters.length && filteredCharacters.length > 0
                                ? 'bg-blue-500 border-blue-500 text-white'
                                : 'bg-transparent border-current'
                        }`}>
                            {selectedIds.size === filteredCharacters.length && filteredCharacters.length > 0 && <Check size={14} strokeWidth={3} />}
                        </div>
                        全选全部
                     </button>
                     {selectedIds.size > 0 && (
                         <button onClick={() => setSelectedIds(new Set())} className="text-sm font-bold opacity-70 hover:opacity-100 transition-opacity ml-2">
                            取消选择
                         </button>
                     )}
                 </div>
                 <span className="text-sm font-bold opacity-80 border-l border-current pl-4">已选 {selectedIds.size} 项</span>
             </div>
             <div className="flex gap-3">
                 {selectedIds.size === 2 && (
                     <Button 
                         variant="secondary" 
                         onClick={() => setCompareModalOpen(true)} 
                         className="!py-1.5 !px-4 !text-xs !h-9 !rounded-lg shadow-sm hover:shadow-md transition-all bg-indigo-500 hover:bg-indigo-600 text-white border-none"
                     >
                        <GitCompare size={14} className="mr-1.5" /> 对比选中 (2)
                     </Button>
                 )}
                 <Button 
                     variant="secondary" 
                     disabled={selectedIds.size === 0} 
                     onClick={() => setBatchEditModalOpen(true)} 
                     className="!py-1.5 !px-4 !text-xs !h-9 !rounded-lg shadow-sm hover:shadow-md transition-all bg-purple-500 hover:bg-purple-600 text-white border-none disabled:opacity-50"
                 >
                    <Edit2 size={14} className="mr-1.5" /> 批量编辑
                 </Button>
                 <Button 
                     variant="primary" 
                     disabled={selectedIds.size === 0} 
                     onClick={handleBulkExport} 
                     className="!py-1.5 !px-4 !text-xs !h-9 !rounded-lg shadow-sm hover:shadow-md transition-all bg-blue-500 hover:bg-blue-600 border-none"
                 >
                    <Download size={14} className="mr-1.5" /> 导出 (ZIP)
                 </Button>
                 <Button 
                     variant="danger" 
                     disabled={selectedIds.size === 0} 
                     onClick={() => {if(window.confirm(`确定删除这 ${selectedIds.size} 张卡片吗?`)) { onDeleteBatch?.(Array.from(selectedIds)); setSelectedIds(new Set()); }}} 
                     className="!py-1.5 !px-4 !text-xs !h-9 !rounded-lg shadow-sm hover:shadow-md transition-all bg-red-500 hover:bg-red-600 border-none"
                 >
                    <Trash2 size={14} className="mr-1.5" /> 删除
                 </Button>
             </div>
          </div>
      )}

      {error && <div className="mb-4 mx-2 p-3 bg-red-500/20 border border-red-500/40 rounded-xl flex items-center gap-3 text-red-100 backdrop-blur-md text-sm"><AlertCircle className="text-red-400" size={16} />{error}</div>}
      {warning && <div className="mb-4 mx-2 p-3 bg-yellow-500/20 border border-yellow-500/40 rounded-xl flex items-center gap-3 text-yellow-100 backdrop-blur-md text-sm"><AlertTriangle className="text-yellow-400" size={16} />{warning}</div>}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-20 custom-scrollbar">
        {activeFilter.type === 'duplicate' && groupedCharacters ? (
            <div className="px-2 space-y-8">
                {Object.entries(groupedCharacters).map(([name, chars]: [string, Character[]]) => (
                    <div key={name} className="animate-fade-in">
                        {/* Group Header */}
                        <div className="flex items-center justify-between mb-4 pl-2 pr-4">
                            <div className="flex items-center">
                                <div className="w-1 h-6 bg-red-500 rounded-full mr-3 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
                                <h2 className={`text-lg font-bold ${textColor}`}>{name}</h2>
                                <span className="px-2 py-0.5 bg-red-500/10 text-red-500 text-xs font-bold rounded-full ml-3 border border-red-500/20">
                                    {chars.length} 张
                                </span>
                            </div>
                            <Button 
                                variant="secondary" 
                                disabled={chars.filter(c => selectedIds.has(c.id)).length !== 2}
                                onClick={() => setCompareModalOpen(true)} 
                                className="!py-1 !px-3 !text-xs !h-8 !rounded-lg shadow-sm hover:shadow-md transition-all bg-indigo-500 hover:bg-indigo-600 text-white border-none disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <GitCompare size={12} className="mr-1.5" /> 对比选中 (2)
                            </Button>
                        </div>
                        {/* Group Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                            {chars.map(char => renderCharacterCard(char))}
                        </div>
                    </div>
                ))}
                {Object.keys(groupedCharacters).length === 0 && (
                    <div className={`text-center py-20 opacity-50 ${textColor}`}>没有发现重复角色</div>
                )}
            </div>
        ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5 px-2">
                {displayCharacters.map((char) => renderCharacterCard(char))}
            </div>
        )}

        {/* Pagination (Only for non-grouped view) */}
        {activeFilter.type !== 'duplicate' && totalPages > 1 && (
            <div className={`flex justify-between items-center gap-4 mt-6 mb-8 px-4 py-3 rounded-2xl ${theme === 'light' ? 'bg-white shadow-sm border border-slate-200' : 'bg-black/20 border border-white/10'}`}>
                {/* Left: Items Per Page */}
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>每页显示</span>
                    <div className="relative">
                        <select 
                            value={itemsPerPage}
                            onChange={(e) => setItemsPerPage(Number(e.target.value))}
                            className={`appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-bold outline-none cursor-pointer transition-colors ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                        >
                            {[20, 30, 50, 100, 250, 500, 1000].map(size => (
                                <option key={size} value={size} className="text-black">{size}</option>
                            ))}
                        </select>
                        <ChevronDown size={12} className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${theme === 'light' ? 'text-slate-500' : 'text-white/50'}`} />
                    </div>
                </div>

                {/* Center: Navigation */}
                <div className={`flex items-center gap-4 px-4 py-1.5 rounded-xl ${theme === 'light' ? 'bg-slate-50' : 'bg-white/5'}`}>
                    <button 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                        disabled={currentPage === 1} 
                        className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${theme === 'light' ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-gray-300'}`}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className={`text-xs font-bold font-mono ${theme === 'light' ? 'text-slate-700' : 'text-gray-200'}`}>
                        {currentPage} / {totalPages}
                    </span>
                    <button 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                        disabled={currentPage === totalPages} 
                        className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${theme === 'light' ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-gray-300'}`}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>

                {/* Right: Jump To */}
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>跳转至</span>
                    <input 
                        type="number" 
                        min={1} 
                        max={totalPages}
                        value={jumpPage}
                        onChange={(e) => setJumpPage(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                const page = parseInt(jumpPage);
                                if (page >= 1 && page <= totalPages) {
                                    setCurrentPage(page);
                                    setJumpPage('');
                                }
                            }
                        }}
                        className={`w-12 px-2 py-1.5 text-center text-xs font-bold rounded-lg outline-none transition-all ${theme === 'light' ? 'bg-white border border-slate-200 focus:border-blue-500 text-slate-700' : 'bg-black/20 border border-white/10 focus:border-blue-500/50 text-white'}`}
                    />
                    <button 
                        onClick={() => {
                            const page = parseInt(jumpPage);
                            if (page >= 1 && page <= totalPages) {
                                setCurrentPage(page);
                                setJumpPage('');
                            }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors ${theme === 'light' ? 'bg-slate-800 hover:bg-slate-900' : 'bg-white/10 hover:bg-white/20'}`}
                    >
                        Go
                    </button>
                </div>
            </div>
        )}
      </div>
      </div>
      {/* Import Error Modal */}
      <Modal
        isOpen={importErrorModalOpen}
        onClose={() => setImportErrorModalOpen(false)}
        title="导入结果"
        theme={theme}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
             <div className="text-green-500 font-bold">成功: {importResults?.success}</div>
             <div className="text-red-500 font-bold">失败: {importResults?.failed}</div>
          </div>
          
          {importResults && (importResults as ImportResults).failedFiles.length > 0 && (
            <div className="mt-4">
              <h4 className="font-semibold mb-2 text-sm uppercase tracking-wider opacity-70">失败文件详情</h4>
              <div className={`rounded-lg p-3 text-sm font-mono overflow-x-auto ${theme === 'light' ? 'bg-red-50 text-red-800' : 'bg-red-900/20 text-red-200'}`}>
                <ul className="list-disc list-inside space-y-1">
                  {(importResults as ImportResults).failedFiles.map((msg, idx) => (
                    <li key={idx} className="break-all">{msg}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          
          <div className="flex justify-end mt-6">
            <Button onClick={() => setImportErrorModalOpen(false)} variant="primary">
              关闭
            </Button>
          </div>
        </div>
      </Modal>

      {/* Compare Modal - 档案深度对比 */}
      {compareModalOpen && selectedIds.size === 2 && (() => {
          const ids = Array.from(selectedIds);
          const charA = characters.find(c => c.id === ids[0]);
          const charB = characters.find(c => c.id === ids[1]);
          if (!charA || !charB) return null;

          const hasDiff = (a: string | undefined, b: string | undefined) => (a || '').length !== (b || '').length;
          const diffRing = (diff: boolean) => diff
              ? (theme === 'light' ? 'ring-2 ring-rose-300 bg-rose-50/50' : 'ring-2 ring-rose-500/40 bg-rose-900/20')
              : '';
          const bigNumColor = (mine: number, other: number) =>
              mine > other ? 'text-green-500' : mine < other ? 'text-rose-500' : (theme === 'light' ? 'text-gray-600' : 'text-gray-400');
          const wiCount = (c: Character) => c.character_book?.entries?.length ?? 0;
          const wiTotalChars = (c: Character) => (c.character_book?.entries ?? []).reduce((s, e) => s + (e.content?.length ?? 0), 0);
          const firstMesTotal = (c: Character) => 1 + (c.alternate_greetings?.length ?? 0);

          const handleKeep = (keepId: string) => {
              const dropId = ids.find(id => id !== keepId)!;
              if (!window.confirm('保留此版本并删除另一张卡片？此操作不可撤销。')) return;
              onDelete(dropId);
              setCompareModalOpen(false);
              setSelectedIds(new Set());
              setIsSelectionMode(false);
          };

          const panelBase = `p-4 rounded-2xl border ${theme === 'light' ? 'bg-white border-gray-200 shadow-sm' : 'bg-white/5 border-white/10'}`;
          const labelCls = `text-[10px] font-bold uppercase tracking-widest ${theme === 'light' ? 'text-gray-400' : 'text-gray-500'}`;
          const previewBox = `h-36 overflow-y-auto custom-scrollbar text-xs leading-relaxed font-mono p-3 rounded-xl whitespace-pre-wrap ${theme === 'light' ? 'bg-gray-50 text-gray-600 border border-gray-100' : 'bg-black/20 text-gray-400 border border-white/5'}`;

          const renderCol = (char: Character, other: Character, label: string) => (
              <div className="flex flex-col gap-4">
                  {/* 头部 */}
                  <div className={panelBase}>
                      <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${theme === 'light' ? 'text-gray-400' : 'text-gray-500'}`}>{label}</div>
                      <div className="flex gap-3 items-start">
                          <img src={char.avatarUrl} alt={char.name} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                          <div className="flex-1 min-w-0">
                              <div className={`font-black text-base truncate ${theme === 'light' ? 'text-gray-800' : 'text-white'}`}>{char.name}</div>
                              <div className={`text-[10px] font-mono truncate mt-0.5 ${theme === 'light' ? 'text-gray-400' : 'text-gray-500'}`}>{char.originalFilename || 'local'}</div>
                              <div className={`text-[10px] mt-0.5 ${theme === 'light' ? 'text-gray-400' : 'text-gray-500'}`}>{new Date(char.importDate || 0).toLocaleString()}</div>
                          </div>
                      </div>
                      <button onClick={() => handleKeep(char.id)}
                          className="mt-3 w-full px-3 py-2 bg-slate-800 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors">
                          保留此版本
                      </button>
                  </div>

                  {/* Description */}
                  <div className={`${panelBase} ${diffRing(hasDiff(char.description, other.description))}`}>
                      <div className="flex justify-between items-center mb-2">
                          <span className={labelCls}>Description</span>
                          <span className={`text-xl font-black font-mono ${bigNumColor((char.description || '').length, (other.description || '').length)}`}>
                              {(char.description || '').length}
                          </span>
                      </div>
                      <div className={previewBox}>{char.description || '(空)'}</div>
                  </div>

                  {/* First Message */}
                  <div className={`${panelBase} ${diffRing(hasDiff(char.firstMessage, other.firstMessage))}`}>
                      <div className="flex justify-between items-center mb-2">
                          <span className={labelCls}>First Message</span>
                          <span className={`text-xl font-black font-mono ${bigNumColor((char.firstMessage || '').length, (other.firstMessage || '').length)}`}>
                              {(char.firstMessage || '').length}
                          </span>
                      </div>
                      <div className={previewBox}>{char.firstMessage || '(空)'}</div>
                  </div>

                  {/* 开场白统计 */}
                  <div className={panelBase}>
                      <div className="flex justify-between items-center mb-2">
                          <span className={labelCls}>开场白数量</span>
                          <span className={`text-xl font-black font-mono ${bigNumColor(firstMesTotal(char), firstMesTotal(other))}`}>
                              {firstMesTotal(char)}
                          </span>
                      </div>
                      <div className="space-y-1.5">
                          <div className={`p-2 rounded-lg text-xs flex justify-between items-center ${
                              hasDiff(char.firstMessage, other.firstMessage)
                                  ? (theme === 'light' ? 'bg-rose-50 ring-1 ring-rose-200' : 'bg-rose-900/20 ring-1 ring-rose-500/30')
                                  : (theme === 'light' ? 'bg-blue-50' : 'bg-blue-500/10')
                          }`}>
                              <span className={`font-bold ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>主开场白</span>
                              <span className={`font-black ${bigNumColor((char.firstMessage || '').length, (other.firstMessage || '').length)}`}>
                                  {(char.firstMessage || '').length} 字
                              </span>
                          </div>
                          {(char.alternate_greetings || []).map((alt, idx) => (
                              <div key={idx} className={`p-2 rounded-lg text-xs flex justify-between items-center ${
                                  hasDiff(alt, (other.alternate_greetings || [])[idx])
                                      ? (theme === 'light' ? 'bg-rose-50 ring-1 ring-rose-200' : 'bg-rose-900/20 ring-1 ring-rose-500/30')
                                      : (theme === 'light' ? 'bg-gray-50' : 'bg-white/5')
                              }`}>
                                  <span className={theme === 'light' ? 'text-gray-500' : 'text-gray-500'}>备用 #{idx + 1}</span>
                                  <span className={`font-black ${bigNumColor((alt || '').length, ((other.alternate_greetings || [])[idx] || '').length)}`}>
                                      {(alt || '').length} 字
                                  </span>
                              </div>
                          ))}
                          {/* 对方有但自己没有的备选 */}
                          {(other.alternate_greetings || []).slice((char.alternate_greetings || []).length).map((_, idx) => (
                              <div key={`missing-${idx}`} className={`p-2 rounded-lg text-xs flex justify-between items-center ${theme === 'light' ? 'bg-rose-50 ring-1 ring-rose-200' : 'bg-rose-900/20 ring-1 ring-rose-500/30'}`}>
                                  <span className={`${theme === 'light' ? 'text-gray-500' : 'text-gray-500'}`}>备用 #{(char.alternate_greetings || []).length + idx + 1}</span>
                                  <span className="text-rose-400 font-bold">缺失</span>
                              </div>
                          ))}
                      </div>
                  </div>

                  {/* 世界书 */}
                  <div className={`${panelBase} ${diffRing(wiCount(char) !== wiCount(other))}`}>
                      <div className="flex justify-between items-center mb-3">
                          <span className={labelCls}>世界书 (Lorebook)</span>
                          <span className={`text-xl font-black font-mono ${bigNumColor(wiCount(char), wiCount(other))}`}>
                              {wiCount(char)} 条
                          </span>
                      </div>
                      <div className={`p-3 rounded-xl ${theme === 'light' ? 'bg-purple-50' : 'bg-purple-500/10'}`}>
                          <div className={`text-xs mb-1 ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>总字符数</div>
                          <div className={`text-2xl font-black ${bigNumColor(wiTotalChars(char), wiTotalChars(other))}`}>
                              {wiTotalChars(char).toLocaleString()}
                          </div>
                      </div>
                  </div>
              </div>
          );

          return (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-6 bg-black/60 backdrop-blur-md">
                  <div className={`w-full max-w-5xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden ${theme === 'light' ? 'bg-white' : 'bg-slate-900'}`}>
                      <div className={`px-6 py-4 border-b flex justify-between items-center shrink-0 ${theme === 'light' ? 'bg-gray-50 border-gray-100' : 'bg-slate-800 border-white/10'}`}>
                          <span className={`font-black text-base flex items-center gap-2 ${theme === 'light' ? 'text-gray-800' : 'text-white'}`}>
                              <GitCompare size={18} className="text-rose-500" /> 档案深度对比 (Diff Check)
                              <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${theme === 'light' ? 'bg-rose-100 text-rose-600' : 'bg-rose-500/20 text-rose-400'}`}>
                                  红框 = 有差异
                              </span>
                          </span>
                          <button onClick={() => setCompareModalOpen(false)}
                              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${theme === 'light' ? 'hover:bg-gray-200 text-gray-500' : 'hover:bg-white/10 text-gray-400'}`}>
                              <X size={18} />
                          </button>
                      </div>
                      <div className={`flex-1 overflow-y-auto custom-scrollbar p-6 ${theme === 'light' ? 'bg-slate-50/50' : 'bg-slate-900'}`}>
                          <div className="grid grid-cols-2 gap-5">
                              {renderCol(charA, charB, 'Card A')}
                              {renderCol(charB, charA, 'Card B')}
                          </div>
                      </div>
                  </div>
              </div>
          );
      })()}

      {/* Batch Edit Modal */}
      <Modal
        isOpen={batchEditModalOpen}
        onClose={() => setBatchEditModalOpen(false)}
        title={`批量编辑 (${selectedIds.size} 张卡片)`}
        theme={theme}
      >
        <div className="space-y-5">
            <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>
                    添加标签 (多个用逗号分隔)
                </label>
                <input
                    type="text"
                    value={batchTagsToAdd}
                    onChange={(e) => setBatchTagsToAdd(e.target.value)}
                    placeholder="tag1, tag2, tag3..."
                    className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition-all ${theme === 'light' ? 'bg-slate-100 border border-slate-200 text-slate-800 focus:border-blue-400' : 'bg-black/20 border border-white/10 text-white focus:border-white/30'}`}
                />
            </div>
            <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>
                    设置作者备注 (会覆盖现有备注)
                </label>
                <input
                    type="text"
                    value={batchCreator}
                    onChange={(e) => setBatchCreator(e.target.value)}
                    placeholder="作者/来源..."
                    className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition-all ${theme === 'light' ? 'bg-slate-100 border border-slate-200 text-slate-800 focus:border-blue-400' : 'bg-black/20 border border-white/10 text-white focus:border-white/30'}`}
                />
            </div>
            <div className="flex justify-end gap-3 mt-6">
                <Button variant="secondary" onClick={() => setBatchEditModalOpen(false)}>取消</Button>
                <Button variant="primary" onClick={handleBatchEdit}>应用</Button>
            </div>
        </div>
      </Modal>

      {/* First Message Preview Modal */}
      {firstMesPreviewChar && (
        <Modal
          isOpen={!!firstMesPreviewChar}
          onClose={() => setFirstMesPreviewChar(null)}
          title={`开场白 — ${firstMesPreviewChar.name}`}
          theme={theme}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4">
              {/* Main first message */}
              <div>
                  <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>
                      主开场白 ({firstMesPreviewChar.firstMessage?.length || 0} 字符)
                  </div>
                  <div className={`rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar ${theme === 'light' ? 'bg-slate-50 text-slate-700' : 'bg-white/5 text-gray-300'}`}>
                      {firstMesPreviewChar.firstMessage || '(无)'}
                  </div>
              </div>
              {/* Alternate greetings */}
              {firstMesPreviewChar.alternate_greetings && firstMesPreviewChar.alternate_greetings.length > 0 && (
                  <div>
                      <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>
                          备选开场白 ({firstMesPreviewChar.alternate_greetings.length} 条)
                      </div>
                      <div className="space-y-3 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                          {firstMesPreviewChar.alternate_greetings.map((msg, idx) => (
                              <div key={idx} className={`rounded-xl p-3 text-sm leading-relaxed whitespace-pre-wrap ${theme === 'light' ? 'bg-slate-50 border border-slate-100 text-slate-600' : 'bg-white/5 border border-white/5 text-gray-400'}`}>
                                  <div className={`text-[10px] font-bold mb-1 uppercase ${theme === 'light' ? 'text-slate-400' : 'text-gray-500'}`}>#{idx + 1}</div>
                                  {msg}
                              </div>
                          ))}
                      </div>
                  </div>
              )}
              <div className="flex justify-end mt-4">
                  <Button onClick={() => setFirstMesPreviewChar(null)} variant="primary">关闭</Button>
              </div>
          </div>
        </Modal>
      )}

      {/* World Info Modal */}
      {wiModalChar && (
        <Modal
          isOpen={!!wiModalChar}
          onClose={() => { setWiModalChar(null); setWiSelectedIndex(-1); }}
          title={`世界书 — ${wiModalChar.name}`}
          theme={theme}
          maxWidth="max-w-4xl"
        >
          <div className="flex gap-4 h-[500px]">
              {/* Left: Entry list */}
              <div className={`w-52 shrink-0 overflow-y-auto custom-scrollbar rounded-xl p-2 space-y-1 ${theme === 'light' ? 'bg-slate-50 border border-slate-200' : 'bg-black/20 border border-white/5'}`}>
                  {wiModalChar.character_book?.entries?.map((entry, idx) => (
                      <button
                          key={idx}
                          onClick={() => setWiSelectedIndex(idx)}
                          className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                              wiSelectedIndex === idx
                                  ? 'bg-blue-500 text-white shadow'
                                  : (theme === 'light' ? 'hover:bg-white text-slate-600' : 'hover:bg-white/10 text-gray-400')
                          } ${entry.enabled === false ? 'opacity-50' : ''}`}
                      >
                          <div className="truncate">{entry.name || entry.comment || (entry.keys?.join(', ') || `条目 ${idx + 1}`)}</div>
                          <div className="text-[10px] opacity-60 mt-0.5">{entry.keys?.join(', ') || '无触发词'}</div>
                      </button>
                  ))}
              </div>
              {/* Right: Entry detail */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {wiSelectedIndex >= 0 && wiModalChar.character_book?.entries?.[wiSelectedIndex] ? (() => {
                      const entry = wiModalChar.character_book!.entries[wiSelectedIndex];
                      return (
                          <div className="space-y-4">
                              <div>
                                  <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${theme === 'light' ? 'text-slate-500' : 'text-gray-500'}`}>名称 / 备注</div>
                                  <div className={`px-3 py-2 rounded-lg text-sm ${theme === 'light' ? 'bg-slate-50 text-slate-700' : 'bg-white/5 text-gray-300'}`}>{entry.name || entry.comment || '—'}</div>
                              </div>
                              <div>
                                  <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${theme === 'light' ? 'text-slate-500' : 'text-gray-500'}`}>触发关键词</div>
                                  <div className="flex flex-wrap gap-1.5">
                                      {entry.keys?.map((k, ki) => (
                                          <span key={ki} className={`px-2 py-0.5 rounded-full text-xs font-medium ${theme === 'light' ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-300'}`}>{k}</span>
                                      ))}
                                  </div>
                              </div>
                              <div>
                                  <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${theme === 'light' ? 'text-slate-500' : 'text-gray-500'}`}>内容 ({entry.content?.length || 0} 字符)</div>
                                  <div className={`px-3 py-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar ${theme === 'light' ? 'bg-slate-50 border border-slate-100 text-slate-700' : 'bg-white/5 border border-white/5 text-gray-300'}`}>
                                      {entry.content || '(空)'}
                                  </div>
                              </div>
                              <div className="flex gap-4 text-xs">
                                  <span className={theme === 'light' ? 'text-slate-500' : 'text-gray-500'}>插入顺序: <b>{entry.insertion_order ?? '—'}</b></span>
                                  <span className={theme === 'light' ? 'text-slate-500' : 'text-gray-500'}>优先级: <b>{entry.priority ?? '—'}</b></span>
                                  <span className={`font-medium ${entry.enabled === false ? 'text-red-400' : 'text-green-400'}`}>{entry.enabled === false ? '已禁用' : '已启用'}</span>
                              </div>
                          </div>
                      );
                  })() : (
                      <div className={`flex items-center justify-center h-full text-sm ${theme === 'light' ? 'text-slate-400' : 'text-gray-500'}`}>
                          选择左侧条目查看详情
                      </div>
                  )}
              </div>
          </div>
          <div className="flex justify-between items-center mt-4">
              <span className={`text-xs ${theme === 'light' ? 'text-slate-400' : 'text-gray-500'}`}>
                  共 {wiModalChar.character_book?.entries?.length || 0} 条世界书条目
              </span>
              <Button onClick={() => { setWiModalChar(null); setWiSelectedIndex(-1); }} variant="primary">关闭</Button>
          </div>
        </Modal>
      )}

    </div>
  );
};

export default CharacterList;
