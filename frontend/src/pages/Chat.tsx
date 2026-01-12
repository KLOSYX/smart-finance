import React, { useState, useEffect } from 'react';
import { Box, Button, Typography, Paper } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteIcon from '@mui/icons-material/Delete';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import {
    MainContainer, ChatContainer, MessageList, Message, MessageInput,
    Avatar as ChatAvatar
} from '@chatscope/chat-ui-kit-react';
import { sendChatMessage } from '../api';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export default function Chat() {
    const [messages, setMessages] = useState<ChatMessage[]>(() => {
        const saved = localStorage.getItem('chat_history');
        return saved ? JSON.parse(saved) : [];
    });
    const [loading, setLoading] = useState(false);

    // Save to local storage
    useEffect(() => {
        localStorage.setItem('chat_history', JSON.stringify(messages));
    }, [messages]);

    const handleClear = () => {
        if (window.confirm("确定要清空所有对话历史吗？")) {
            setMessages([]);
            localStorage.removeItem('chat_history');
        }
    };

    const handleSend = async (text: string) => {
        if (!text.trim()) return;

        const userMsg: ChatMessage = { role: 'user', content: text };
        setMessages(prev => [...prev, userMsg]);
        setLoading(true);

        try {
            const history = messages.slice(-10);
            const data = await sendChatMessage(text, history);

            const aiMsg: ChatMessage = { role: 'assistant', content: data.response };
            setMessages(prev => [...prev, aiMsg]);
        } catch (error) {
            console.error(error);
            const errorMsg: ChatMessage = { role: 'assistant', content: "抱歉，我在处理您的请求时遇到了错误。" };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    const generateAdvice = () => {
        handleSend("请根据我的交易记录，分析我的消费习惯并给出具体的财务建议。请包含：1. 主要支出类别分析 2. 异常消费提醒 3. 省钱建议。");
    };

    return (
        <Box sx={{ height: '80vh', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h4" sx={{ fontWeight: 'bold' }}>AI 财务顾问</Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={handleClear}
                        disabled={messages.length === 0}
                    >
                        清空记录
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<AutoAwesomeIcon />}
                        onClick={generateAdvice}
                        disabled={loading}
                    >
                        生成财务分析报告
                    </Button>
                </Box>
            </Box>

            <Box
                sx={{
                    flexGrow: 1,
                    overflow: 'hidden',
                    bgcolor: '#f4f7f9',
                    position: 'relative',
                    borderRadius: '24px',
                    border: '1px solid #e5e7eb',
                    '& .cs-main-container': {
                        border: 'none',
                        bgcolor: 'transparent',
                    },
                    '& .cs-chat-container': {
                        bgcolor: 'transparent',
                    },
                    '& .cs-message-list': {
                        bgcolor: 'transparent',
                        paddingBottom: '100px',
                        paddingTop: '20px',
                    },
                    '& .cs-message--incoming .cs-message__content': {
                        backgroundColor: 'transparent',
                        boxShadow: 'none',
                        padding: 0,
                    },
                    '& .cs-message--outgoing .cs-message__content': {
                        backgroundColor: '#6366f1', // Indigo color
                        color: 'white',
                        borderRadius: '18px 18px 4px 18px',
                        padding: '10px 16px',
                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
                    },
                    '& .cs-message-input': {
                        position: 'absolute',
                        bottom: 24,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '90%',
                        maxWidth: '800px',
                        backgroundColor: '#ffffff !important',
                        border: '1px solid #e5e7eb',
                        borderRadius: '16px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        padding: '4px 8px',
                        zIndex: 10,
                    },
                    '& .cs-message-input__content-editor-wrapper': {
                        backgroundColor: 'transparent !important',
                        border: 'none !important',
                    },
                    '& .cs-message-input__content-editor': {
                        fontSize: '15px',
                        color: '#1f2937',
                        backgroundColor: 'transparent !important',
                    },
                    '& .cs-button--send': {
                        color: '#6366f1 !important',
                    }
                }}
            >
                <MainContainer>
                    <ChatContainer>
                        <MessageList>
                            {messages.map((msg, index) => (
                                <Message
                                    key={index}
                                    model={{
                                        message: msg.role === 'user' ? msg.content : undefined,
                                        sentTime: "just now",
                                        sender: msg.role === 'user' ? "User" : "AI",
                                        direction: msg.role === 'user' ? "outgoing" : "incoming",
                                        position: "single"
                                    }}
                                >
                                    {msg.role === 'assistant' ? (
                                        <Message.CustomContent>
                                            <Paper elevation={0} sx={{
                                                p: 2,
                                                borderRadius: '20px',
                                                bgcolor: '#ffffff',
                                                border: '1px solid #e5e7eb',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                                maxWidth: '95%',
                                                // Ultra-tight Markdown styling
                                                '& *': { margin: 0, padding: 0 },
                                                '& p': { mb: '0.3em', lineHeight: 1.4 },
                                                '& p:last-child': { mb: 0 },
                                                '& h1, & h2, & h3': { color: '#111827', mt: '0.6em', mb: '0.3em', fontWeight: 600, lineHeight: 1.3 },
                                                '& h1': { fontSize: '1.15em' },
                                                '& h2': { fontSize: '1.1em' },
                                                '& h3': { fontSize: '1.05em' },
                                                '& ul, & ol': { pl: '1.2em', mb: '0.3em', listStyle: 'outside' },
                                                '& li': { mb: '0.15em', lineHeight: 1.4 },
                                                '& strong': { color: '#111827', fontWeight: 600 },
                                                '& blockquote': { pl: 1.5, borderLeft: '3px solid #e5e7eb', color: '#6b7280', fontStyle: 'italic', my: '0.3em' },
                                                '& code': { px: 0.5, py: 0.2, bgcolor: '#f3f4f6', borderRadius: '3px', fontSize: '0.9em' }
                                            }}>
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        p: ({ children }) => <span style={{ display: 'inline' }}>{children}</span>,
                                                        li: ({ children, ...props }) => <li {...props} style={{ display: 'list-item' }}><span style={{ display: 'inline' }}>{children}</span></li>
                                                    }}
                                                >
                                                    {msg.content}
                                                </ReactMarkdown>
                                            </Paper>
                                        </Message.CustomContent>
                                    ) : null}
                                    <ChatAvatar
                                        src={msg.role === 'assistant'
                                            ? "https://ui-avatars.com/api/?name=AI&background=f3f4f6&color=4b5563&length=2&rounded=true&bold=true&size=48"
                                            : "https://ui-avatars.com/api/?name=Me&background=6366f1&color=fff&length=2&rounded=true&bold=true&size=48"
                                        }
                                        name={msg.role === 'assistant' ? "AI Assistant" : "Me"}
                                    />
                                </Message>
                            ))}
                            {loading && (
                                <Message model={{
                                    direction: "incoming",
                                    position: "single",
                                    sender: "AI"
                                }}>
                                    <Message.CustomContent>
                                        <Paper elevation={0} sx={{
                                            p: 2,
                                            borderRadius: '20px',
                                            bgcolor: '#ffffff',
                                            border: '1px solid #e5e7eb',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 1
                                        }}>
                                            <Typography variant="body2" color="text.secondary">AI 正在思考...</Typography>
                                            <div className="typing-dots">
                                                <span></span>
                                                <span></span>
                                                <span></span>
                                            </div>
                                        </Paper>
                                    </Message.CustomContent>
                                    <ChatAvatar
                                        src="https://ui-avatars.com/api/?name=AI&background=f3f4f6&color=4b5563&length=2&rounded=true&bold=true&size=48"
                                        name="AI Assistant"
                                    />
                                </Message>
                            )}
                        </MessageList>
                        <MessageInput
                            placeholder="输入问题，例如：我上个月在餐饮上花了多少钱？"
                            onSend={handleSend}
                            disabled={loading}
                            attachButton={false}
                        />
                    </ChatContainer>
                </MainContainer>
            </Box>
        </Box>
    );
}
