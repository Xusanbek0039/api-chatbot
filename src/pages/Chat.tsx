// Chat.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Send, Copy, CheckCircle, Mic, FilePlus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface Message {
  id: string;
  type: 'user' | 'bot';
  content: string;
  timestamp: Date;
}

const Chat: React.FC = () => {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

  useEffect(() => {
    setMessages([
      {
        id: '1',
        type: 'bot',
        content: t('chatWelcome') || 'Assalomu alaykum! Zomin AI yordamda sizga qanday yordam bera olaman?',
        timestamp: new Date(),
      },
    ]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatText = (text: string) => {
    const linkRegex = /\*\*(.*?)\*\*(?:\s*\((https?:\/\/[^\s)]+)\))?/g;
    const formattedParts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(text)) !== null) {
      const [fullMatch, boldText, url] = match;
      const matchStart = match.index;

      if (matchStart > lastIndex) {
        formattedParts.push(text.slice(lastIndex, matchStart));
      }

      if (url) {
        formattedParts.push(
          <a key={match.index} href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-500 underline hover:text-blue-600 transition">
            {boldText}
          </a>
        );
      } else {
        formattedParts.push(
          <strong key={match.index} className="font-semibold">
            {boldText}
          </strong>
        );
      }

      lastIndex = match.index + fullMatch.length;
    }

    if (lastIndex < text.length) {
      formattedParts.push(text.slice(lastIndex));
    }

    return formattedParts;
  };

  const formatCodeBlocks = (text: string, messageId: string) => {
    const regex = /```([\s\S]*?)```/g;
    const parts = text.split(regex);

    return parts.map((chunk, i) => {
      if (i % 2 === 1) {
        const code = chunk.trim();
        const isCopied = copiedId === `${messageId}-${i}`;
        return (
          <div key={i} className="relative my-4">
            <button
              onClick={() => copyCode(code, `${messageId}-${i}`)}
              className="absolute top-2 right-2 text-xs text-white bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded z-10"
            >
              {isCopied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <div className="overflow-auto max-w-full">
              <pre className="bg-gray-900 text-white p-4 rounded-lg overflow-auto text-sm">
                <code>{code}</code>
              </pre>
            </div>
          </div>
        );
      } else {
        return <p key={i} className="whitespace-pre-wrap leading-relaxed">{formatText(chunk)}</p>;
      }
    });
  };

  const sendToOpenAIStream = async (message: string) => {
    const userMsgId = Date.now().toString();
    const botMsgId = (Date.now() + 1).toString();

    const userMsg: Message = {
      id: userMsgId,
      type: 'user',
      content: message,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const botMsg: Message = {
      id: botMsgId,
      type: 'bot',
      content: '',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, botMsg]);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: `
              Sen hazilkash, do'stona va foydalanuvchiga quvnoq ohangda javob beradigan sun'iy intellektsan.
              Seni Husan Suyunov (husanbek.coder.uz) yaratgan va u ZominAI — IT Creative jamoasi tomonidan ishlab chiqilgan.
              Sen foydalanuvchi yozgan tilda javob ber: agar u Uzbek tilida yozsa, sen ham o'zbekcha javob ber; agar ruscha, inglizcha, turkcha yoki qozoqcha yozsa — shunga mos tilni ishlat.
              Har javobingda ozgina hazil, kulgu yoki samimiy ohang bo‘lishi kerak. Yordam berishda doimo mehribon va motivatsion bo‘l.
            ` },
          { role: 'user', content: message },
        ],
        stream: true,
        temperature: 1,
      }),
    });

    if (!response.body) {
      setIsLoading(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let partial = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter((line) => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.replace(/^data: /, '');
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              partial += content;
              setMessages((prev) =>
                prev.map((msg) => (msg.id === botMsgId ? { ...msg, content: partial } : msg))
              );
            }
          } catch {}
        }
      }
    }

    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const inputText = input.trim();
    setInput('');
    await sendToOpenAIStream(inputText);
  };

  const copyCode = async (text: string, blockId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(blockId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window))
      return alert('Brauzeringiz ovozli kirishni qo‘llab-quvvatlamaydi.');

    if (!recognitionRef.current) {
      const recognition = new (window as any).webkitSpeechRecognition();
      recognition.lang = 'uz-UZ';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput((prev) => prev + ' ' + transcript);
        setIsRecording(false);
      };
      recognition.onerror = () => setIsRecording(false);
      recognitionRef.current = recognition;
    }

    if (!isRecording) {
      recognitionRef.current.start();
      setIsRecording(true);
    } else {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  const renderMessage = (msg: Message) => {
    const isBot = msg.type === 'bot';
    const hasCode = msg.content.includes('```');

    return (
      <div key={msg.id} className={`flex ${isBot ? 'justify-start' : 'justify-end'}`}>
        <div
          className={`rounded-2xl px-6 py-4 shadow-lg backdrop-blur-md max-w-full overflow-x-auto
            ${isBot ? 'bg-white/80 dark:bg-gray-800/80' : 'bg-gradient-to-br from-purple-600 to-indigo-500 text-white'}`}
        >
          <div className="prose dark:prose-invert max-w-none text-sm">
            {hasCode ? formatCodeBlocks(msg.content, msg.id) : <p className="whitespace-pre-wrap">{formatText(msg.content)}</p>}
          </div>
          <div className="text-xs text-right text-gray-400 mt-2">{msg.timestamp.toLocaleTimeString()}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-screen pt-20 pb-28 overflow-hidden">
      <div className="absolute inset-0 z-0 animate-gradient bg-gradient-to-br from-indigo-400 via-purple-500 to-pink-400 opacity-20 blur-3xl" />
      <div className="relative z-10 max-w-4xl mx-auto px-4 space-y-6">
        {messages.map(renderMessage)}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-md animate-pulse">
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce delay-75" />
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce delay-150" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-20">
        <div className="relative flex items-center gap-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border border-gray-300 dark:border-gray-700 rounded-3xl shadow-lg p-3">
          <button type="button" onClick={handleVoiceInput} className="text-purple-500 hover:text-purple-700">
            <Mic className={`w-5 h-5 ${isRecording ? 'animate-pulse' : ''}`} />
          </button>
          <label htmlFor="file-upload" className="cursor-pointer text-blue-500 hover:text-blue-700">
            <FilePlus className="w-5 h-5" />
            <input id="file-upload" type="file" hidden onChange={() => alert('Fayl yuklandi. (demo)')} />
          </label>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
                textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={t('typeMessage') || 'Xabar yozing...'}
            rows={1}
            className="flex-1 bg-transparent resize-none text-sm focus:outline-none text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 max-h-48 overflow-auto rounded-xl px-3 py-2"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="w-10 h-10 flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500 hover:scale-110 active:scale-95 transition text-white rounded-full shadow-md disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default Chat;
