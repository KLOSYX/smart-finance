import { useState, useEffect } from 'react';
import { Box, Button, Typography, Paper } from '@mui/material';
import { AutoAwesome, Delete, SmartToy } from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import {
    MainContainer, ChatContainer, MessageList, Message, MessageInput,
    Avatar as ChatAvatar
} from '@chatscope/chat-ui-kit-react';
import { sendChatMessage } from '../api';
import { colors } from '../theme';
import type { ChatMessage } from '../api';

export default function Chat() {
    const [messages, setMessages] = useState<ChatMessage[]>(() => {
        const saved = localStorage.getItem('chat_history');
        return saved ? JSON.parse(saved) : [];
    });
    const [loading, setLoading] = useState(false);

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
            const errorMsg: ChatMessage = { role: 'assistant', content: "抱歉，我在处理您的请求时遇到了错误。请检查API配置。" };
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
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <SmartToy sx={{ fontSize: 40, color: 'primary.main' }} />
                    <Typography variant="h4" sx={{ fontWeight: 700, fontFamily: 'Poppins, sans-serif' }}>
                        AI 财务顾问
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <Button
                        variant="contained"
                        startIcon={<AutoAwesome />}
                        onClick={generateAdvice}
                        disabled={loading}
                        sx={{ cursor: 'pointer' }}
                    >
                        生成分析报告
                    </Button>
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<Delete />}
                        onClick={handleClear}
                        disabled={messages.length === 0}
                        sx={{ cursor: 'pointer' }}
                    >
                        清空记录
                    </Button>
                </Box>
            </Box>

            {/* Chat Container */}
            <Box
                sx={{
                    flexGrow: 1,
                    overflow: 'hidden',
                    bgcolor: colors.background.default,
                    position: 'relative',
                    borderRadius: 4,
                    border: `1px solid ${colors.border.main}`,
                    '& .cs-main-container': { border: 'none', bgcolor: 'transparent' },
                    '& .cs-chat-container': { bgcolor: 'transparent' },
                    '& .cs-message-list': { bgcolor: 'transparent', paddingBottom: '100px', paddingTop: '20px' },
                    '& .cs-message--incoming .cs-message__content': { backgroundColor: 'transparent', boxShadow: 'none', padding: 0 },
                    '& .cs-message--outgoing .cs-message__content': {
                        backgroundColor: colors.primary.main,
                        color: 'white',
                        borderRadius: '18px 18px 4px 18px',
                        padding: '10px 16px',
                        boxShadow: `0 4px 12px rgba(59, 130, 246, 0.2)`,
                    },
                    '& .cs-message-input': {
                        position: 'absolute',
                        bottom: 24,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '90%',
                        maxWidth: '800px',
                        backgroundColor: '#ffffff !important',
                        border: `1px solid ${colors.border.main}`,
                        borderRadius: '16px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        padding: '4px 8px',
                        zIndex: 10,
                    },
                    '& .cs-message-input__content-editor-wrapper': { backgroundColor: 'transparent !important', border: 'none !important' },
                    '& .cs-message-input__content-editor': { fontSize: '15px', color: colors.text.primary, backgroundColor: 'transparent !important' },
                    '& .cs-button--send': { color: `${colors.primary.main} !important` },
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
                                            <Paper
                                                elevation={0}
                                                sx={{
                                                    p: 2.5,
                                                    borderRadius: 4,
                                                    bgcolor: '#ffffff',
                                                    border: `1px solid ${colors.border.main}`,
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                                    maxWidth: '95%',
                                                    '& p': { mb: 1, lineHeight: 1.6, '&:last-child': { mb: 0 } },
                                                    '& h1, & h2, & h3': { color: colors.text.primary, mt: 1.5, mb: 0.75, fontWeight: 600, lineHeight: 1.3 },
                                                    '& h1': { fontSize: '1.25em' },
                                                    '& h2': { fontSize: '1.15em' },
                                                    '& h3': { fontSize: '1.1em' },
                                                    '& ul, & ol': { pl: 2, mb: 1, listStyle: 'outside' },
                                                    '& li': { mb: 0.5, lineHeight: 1.6 },
                                                    '& strong': { color: colors.text.primary, fontWeight: 600 },
                                                    '& code': { px: 0.75, py: 0.25, bgcolor: colors.background.default, borderRadius: '4px', fontSize: '0.9em', color: colors.error.main },
                                                    '& table': { width: '100%', borderCollapse: 'collapse', my: 1 },
                                                    '& th, & td': { border: `1px solid ${colors.border.main}`, p: 1, textAlign: 'left' },
                                                    '& th': { bgcolor: colors.background.default, fontWeight: 600 },
                                                }}
                                            >
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {msg.content}
                                                </ReactMarkdown>
                                            </Paper>
                                        </Message.CustomContent>
                                    ) : null}
                                    <ChatAvatar
                                        src={msg.role === 'assistant'
                                            ? "https://ui-avatars.com/api/?name=AI&background=3B82F6&color=fff&length=2&rounded=true&bold=true&size=48"
                                            : "https://ui-avatars.com/api/?name=Me&background=F97316&color=fff&length=2&rounded=true&bold=true&size=48"
                                        }
                                        name={msg.role === 'assistant' ? "AI Assistant" : "Me"}
                                    />
                                </Message>
                            ))}
                            {loading && (
                                <Message
                                    model={{
                                        direction: "incoming",
                                        position: "single",
                                        sender: "AI"
                                    }}
                                >
                                    <Message.CustomContent>
                                        <Paper
                                            elevation={0}
                                            sx={{
                                                p: 2,
                                                borderRadius: 4,
                                                bgcolor: '#ffffff',
                                                border: `1px solid ${colors.border.main}`,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 1
                                            }}
                                        >
                                            <Typography variant="body2" color="text.secondary">AI 正在思考...</Typography>
                                            <div className="typing-dots">
                                                <span></span>
                                                <span></span>
                                                <span></span>
                                            </div>
                                        </Paper>
                                    </Message.CustomContent>
                                    <ChatAvatar
                                        src="https://ui-avatars.com/api/?name=AI&background=3B82F6&color=fff&length=2&rounded=true&bold=true&size=48"
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
