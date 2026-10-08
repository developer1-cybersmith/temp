import React, { useState, useEffect, useRef, useMemo } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { useIsMobile } from '../hooks/useMediaQuery';
import {
  Search,
  Send,
  MessageSquare,
  Pause,
  Play,
  ArrowLeft,
  Mic,
  Image as ImageIcon,
  CheckCheck,
  Phone,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PASTEL_COLORS = [
  { bg: 'bg-pastel-sage', text: 'text-soft-sage' },
  { bg: 'bg-pastel-rose', text: 'text-soft-rose' },
  { bg: 'bg-pastel-honey', text: 'text-soft-honey' },
  { bg: 'bg-pastel-sky', text: 'text-soft-sky' },
  { bg: 'bg-pastel-lavender', text: 'text-soft-lavender' },
  { bg: 'bg-pastel-mint', text: 'text-soft-mint' },
];

function getAvatarColor(index: number) {
  return PASTEL_COLORS[index % PASTEL_COLORS.length];
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatConvoDate(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) {
    return formatTime(dateStr);
  }
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function isVoiceNote(content: string) {
  return content.startsWith('🎤 [Voice Note]:') || content.startsWith('[Voice Note]:');
}

function getVoiceNoteText(content: string) {
  return content.replace(/^🎤?\s*\[Voice Note\]:\s*/, '');
}

function isImageMessage(content: string) {
  return content === '[Customer sent an image]' || content.startsWith('[Image]');
}

const Conversations: React.FC = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(0);

  useEffect(() => {
    if (user) fetchConversations();
  }, [user]);

  useEffect(() => {
    if (!selectedConvo) return;
    fetchMessages(selectedConvo.id);

    const interval = setInterval(() => {
      fetchMessages(selectedConvo.id);
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedConvo]);

  useEffect(() => {
    if (messages.length === 0) return;
    const isNewMessage = messages.length > prevMessageCount.current;
    prevMessageCount.current = messages.length;

    if (!isNewMessage) return;

    const container = messagesContainerRef.current;
    if (!container) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;

    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const fetchConversations = async () => {
    try {
      const res = await client.get('/conversations');
      setConversations(res.data.conversations || []);
    } catch (err) {
      console.error('Failed to fetch conversations', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (id: string) => {
    try {
      const res = await client.get(`/conversations/${id}/messages`);
      setMessages(res.data.messages || []);
    } catch (err) {
      console.error('Failed to fetch messages', err);
    }
  };

  const togglePause = async (id: string, currentStatus: boolean) => {
    try {
      await client.patch(`/conversations/${id}`, { ai_paused: !currentStatus });
      setSelectedConvo({ ...selectedConvo, ai_paused: !currentStatus });
      setConversations(conversations.map(c => c.id === id ? { ...c, ai_paused: !currentStatus } : c));
    } catch (err) {
      console.error('Failed to toggle pause');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedConvo) return;

    try {
      await client.post(`/conversations/${selectedConvo.id}/messages`, {
        content: replyText,
      });

      const newMessage = {
        id: Math.random().toString(),
        sender: 'business_owner',
        content: replyText,
        created_at: new Date().toISOString()
      };

      setMessages([...messages, newMessage]);
      setReplyText('');
    } catch (err) {
      console.error('Failed to send message');
    }
  };

  const handleSelectConvo = (convo: any) => {
    prevMessageCount.current = 0;
    setSelectedConvo(convo);
    if (isMobile) setShowChat(true);
  };

  const handleBack = () => {
    setShowChat(false);
  };

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(c =>
      (c.customer_name || '').toLowerCase().includes(q) ||
      (c.customer_jid || '').includes(q) ||
      (c.summary || '').toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const messagesWithDateSeparators = useMemo(() => {
    const result: any[] = [];
    let lastDate = '';
    for (const msg of messages) {
      const msgDate = new Date(msg.created_at).toDateString();
      if (msgDate !== lastDate) {
        result.push({ _type: 'date_separator', date: msg.created_at, id: `sep-${msgDate}` });
        lastDate = msgDate;
      }
      result.push(msg);
    }
    return result;
  }, [messages]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <div className="w-12 h-12 border-4 border-cream-200 border-t-soft-honey rounded-full animate-spin" />
        <p className="text-ink-50 font-medium animate-pulse">Loading chats...</p>
      </div>
    );
  }

  /* ---------- Message Bubble ---------- */
  const renderMessage = (msg: any) => {
    if (msg._type === 'date_separator') {
      return (
        <div key={msg.id} className="flex items-center justify-center my-3">
          <span className="bg-cream-200/80 text-ink-50 text-[11px] font-medium px-3 py-1 rounded-lg shadow-sm">
            {formatDateSeparator(msg.date)}
          </span>
        </div>
      );
    }

    const isCustomer = msg.sender === 'customer';
    const isAI = msg.sender === 'ai';
    const isOwner = msg.sender === 'business_owner';
    const isOutgoing = isAI || isOwner;
    const content = msg.content || '';

    return (
      <div
        key={msg.id}
        className={cn(
          "flex mb-1",
          isCustomer ? "justify-start" : "justify-end"
        )}
      >
        <div className={cn(
          "relative max-w-[78%] px-3 py-2 text-[13.5px] leading-[1.45] shadow-sm",
          isCustomer
            ? "bg-white text-ink-300 rounded-lg rounded-tl-sm"
            : isAI
              ? "bg-[#dcf8c6] text-ink-300 rounded-lg rounded-tr-sm"
              : "bg-[#e2f0ff] text-ink-300 rounded-lg rounded-tr-sm"
        )}>
          {/* Sender label for AI vs Owner */}
          {isOutgoing && (
            <div className={cn(
              "text-[10px] font-semibold mb-0.5",
              isAI ? "text-[#5b9a3f]" : "text-[#4a8abf]"
            )}>
              {isAI ? '🤖 AI' : '👤 You'}
            </div>
          )}

          {/* Image — real image when we have a URL, placeholder otherwise */}
          {(msg.media_type === 'image' || isImageMessage(content)) ? (
            msg.media_url ? (
              <div>
                <button
                  type="button"
                  onClick={() => setLightboxImage(msg.media_url)}
                  className="block rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-pastel-lavender"
                >
                  <img
                    src={msg.media_url}
                    alt="Shared media"
                    className="max-w-[260px] max-h-[320px] rounded-lg object-cover hover:opacity-95 transition-opacity"
                  />
                </button>
                {content && !isImageMessage(content) && (
                  <p className="text-[13px] mt-1.5 whitespace-pre-wrap break-words">{content}</p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 py-1">
                <div className="w-10 h-10 bg-cream-200 rounded-lg flex items-center justify-center">
                  <ImageIcon className="w-5 h-5 text-ink-50" />
                </div>
                <span className="text-[12.5px] text-ink-200 italic">
                  {isImageMessage(content) ? 'Photo (not stored)' : content}
                </span>
              </div>
            )

          /* Voice / audio — real player when we have a URL, transcript-only otherwise */
          ) : (msg.media_type === 'voice' || msg.media_type === 'audio' || isVoiceNote(content)) ? (
            <div>
              {msg.media_url ? (
                <audio
                  controls
                  src={msg.media_url}
                  className="w-full max-w-[260px] h-10"
                  preload="metadata"
                />
              ) : (
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    isCustomer ? "bg-pastel-sky" : "bg-pastel-sage"
                  )}>
                    <Mic className="w-4 h-4 text-ink-200" />
                  </div>
                  <span className="text-[11px] text-ink-50 italic">Voice note (not stored)</span>
                </div>
              )}
              {isVoiceNote(content) && (
                <p className="text-[12px] text-ink-200 italic mt-1.5">
                  "{getVoiceNoteText(content)}"
                </p>
              )}
            </div>

          /* Regular text message */
          ) : (
            <span className="whitespace-pre-wrap break-words">{content}</span>
          )}

          {/* Timestamp + status */}
          <div className={cn(
            "flex items-center gap-1 mt-0.5",
            isCustomer ? "justify-end" : "justify-end"
          )}>
            <span className="text-[10px] text-ink-50/70">
              {formatTime(msg.created_at)}
            </span>
            {isOutgoing && (
              <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ---------- Conversation List ---------- */
  const conversationList = (
    <div className={cn(
      "flex flex-col",
      isMobile ? "w-full h-full" : "w-[340px] shrink-0"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="font-display text-[20px] font-bold text-ink-400">Chats</h1>
        <span className="bg-pastel-lavender text-soft-lavender text-xs font-bold px-2.5 py-0.5 rounded-full">
          {conversations.length}
        </span>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-50 group-focus-within:text-ink-200 transition-colors" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, number, or topic..."
            className="w-full bg-cream-200/60 rounded-xl h-10 pl-10 pr-4 text-[13px] text-ink-300 placeholder:text-ink-50 focus:outline-none focus:ring-2 focus:ring-pastel-lavender transition-all"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="text-center py-8 text-ink-50 text-sm">
            {searchQuery ? 'No conversations match your search' : 'No conversations yet'}
          </div>
        ) : (
          filteredConversations.map((convo, idx) => {
            const avatar = getAvatarColor(idx);
            const isSelected = selectedConvo?.id === convo.id;
            return (
              <button
                key={convo.id}
                onClick={() => handleSelectConvo(convo)}
                className={cn(
                  "w-full text-left px-3 py-2.5 transition-all duration-150 relative border-b border-cream-100",
                  isSelected
                    ? "bg-pastel-peach/20"
                    : "hover:bg-cream-50"
                )}
              >
                {isSelected && (
                  <motion.div
                    layoutId="active-chat"
                    className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-soft-peach"
                  />
                )}
                <div className="flex gap-3">
                  <div className={cn(
                    "w-11 h-11 rounded-full flex items-center justify-center font-display font-bold text-base shrink-0",
                    avatar.bg, avatar.text
                  )}>
                    {convo.customer_name?.[0]?.toUpperCase() || '?'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[13.5px] font-semibold text-ink-300 truncate pr-2">
                        {convo.customer_name || 'Unknown'}
                      </h3>
                      <span className="text-[11px] text-ink-50 shrink-0">
                        {formatConvoDate(convo.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[12px] text-ink-50 truncate pr-2">
                        {convo.summary || 'New conversation...'}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        {convo.ai_paused && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-pastel-honey text-soft-honey">
                            PAUSED
                          </span>
                        )}
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                          convo.wb_leads?.[0]?.score === 'high'
                            ? "bg-pastel-rose text-soft-rose"
                            : convo.wb_leads?.[0]?.score === 'medium'
                              ? "bg-pastel-honey text-soft-honey"
                              : "bg-pastel-sky text-soft-sky"
                        )}>
                          {convo.wb_leads?.[0]?.score || 'new'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  /* ---------- Chat View ---------- */
  const selectedIndex = conversations.findIndex(c => c.id === selectedConvo?.id);
  const chatAvatar = selectedIndex >= 0 ? getAvatarColor(selectedIndex) : PASTEL_COLORS[0];

  const chatView = (
    <div className={cn(
      "flex flex-col overflow-hidden",
      isMobile ? "w-full h-full" : "flex-1 border-l border-cream-200"
    )}>
      <AnimatePresence mode="wait">
        {selectedConvo ? (
          <motion.div
            key="chat-active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col h-full"
          >
            {/* Chat Header */}
            <div className="px-4 py-3 border-b border-cream-200 flex items-center justify-between bg-cream-50">
              <div className="flex items-center gap-3">
                {isMobile && (
                  <button
                    onClick={handleBack}
                    className="p-1.5 -ml-1 rounded-lg hover:bg-cream-100 transition-colors text-ink-200"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-sm",
                  chatAvatar.bg, chatAvatar.text
                )}>
                  {selectedConvo.customer_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <h2 className="text-[14px] font-bold text-ink-300 leading-tight">
                    {selectedConvo.customer_name}
                  </h2>
                  <p className="text-[11px] text-ink-50 flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    +{selectedConvo.customer_jid?.split('@')[0]}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold",
                  selectedConvo.ai_paused
                    ? "bg-pastel-honey/40 text-soft-honey"
                    : "bg-pastel-sage/40 text-soft-sage"
                )}>
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    selectedConvo.ai_paused ? "bg-soft-honey" : "bg-success"
                  )} />
                  {selectedConvo.ai_paused ? 'AI Off' : 'AI On'}
                </div>
                <button
                  onClick={() => togglePause(selectedConvo.id, selectedConvo.ai_paused)}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
                    selectedConvo.ai_paused
                      ? "bg-pastel-sage/60 text-soft-sage hover:bg-pastel-sage"
                      : "bg-pastel-honey/60 text-soft-honey hover:bg-pastel-honey"
                  )}
                >
                  {selectedConvo.ai_paused
                    ? <><Play className="w-3 h-3" /> Resume</>
                    : <><Pause className="w-3 h-3" /> Pause</>
                  }
                </button>
              </div>
            </div>

            {/* Messages — WhatsApp-style background */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto px-3 py-2"
              style={{
                backgroundColor: '#efeae2',
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4cfc6' fill-opacity='0.3'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }}
            >
              {messagesWithDateSeparators.map(renderMessage)}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose Bar */}
            <form
              onSubmit={handleSendMessage}
              className="bg-cream-50 border-t border-cream-200 px-3 py-2 flex items-center gap-2"
            >
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-white rounded-full px-4 py-2.5 text-[13.5px] text-ink-300 placeholder:text-ink-50 focus:outline-none focus:ring-1 focus:ring-pastel-lavender/60 shadow-sm transition-all"
              />
              <button
                type="submit"
                disabled={!replyText.trim()}
                className="w-10 h-10 bg-[#00a884] rounded-full flex items-center justify-center text-white hover:bg-[#008f6f] transition-colors disabled:opacity-40 shrink-0 shadow-sm"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="chat-empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-4 bg-cream-50"
          >
            <div className="w-20 h-20 bg-pastel-lilac/50 rounded-full flex items-center justify-center">
              <MessageSquare className="w-9 h-9 text-soft-lavender" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-display text-lg font-bold text-ink-300">Select a conversation</h3>
              <p className="text-sm text-ink-50 max-w-xs">
                Pick a chat from the left to view messages and reply to customers.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  /* ---------- Image Lightbox ---------- */
  const lightbox = lightboxImage && (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
      onClick={() => setLightboxImage(null)}
    >
      <img
        src={lightboxImage}
        alt="Full view"
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={() => setLightboxImage(null)}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center text-xl"
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );

  /* ---------- Render ---------- */
  if (isMobile) {
    return (
      <>
        <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
          {showChat && selectedConvo ? chatView : conversationList}
        </div>
        {lightbox}
      </>
    );
  }

  return (
    <>
      <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-cream-100 rounded-2xl border border-cream-200">
        {conversationList}
        {chatView}
      </div>
      {lightbox}
    </>
  );
};

export default Conversations;
