import { useRef, useState } from 'react';
import { Box, Button, Typography, CircularProgress } from '@mui/material';
import { AutoAwesome, Delete, SmartToy } from '@mui/icons-material';
import { ProChat } from '@ant-design/pro-chat';
import { useTheme } from '@mui/material/styles';
import { sendChatMessageStream } from '../api';
import type { ProChatInstance } from '@ant-design/pro-chat';
import { isAxiosError } from 'axios';

export default function Chat() {
    const theme = useTheme();
    const chatRef = useRef<ProChatInstance | undefined>(undefined);
    const [toolStatus, setToolStatus] = useState<string | null>(null);
    const [chatKey, setChatKey] = useState(0);

    // Clear chat history
    const handleClear = () => {
        if (window.confirm("确定要清空所有对话历史吗？")) {
            localStorage.removeItem('pro_chat_history');
            setChatKey(prev => prev + 1);
        }
    };

    // Generate financial advice
    const generateAdvice = () => {
        if (chatRef.current) {
            chatRef.current.sendMessage("请根据我的交易记录，分析我的消费习惯并给出具体的财务建议。请包含：1. 主要支出类别分析 2. 异常消费提醒 3. 省钱建议。");
        }
    };

    // ...

    return (
        <Box sx={{ height: '85vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <SmartToy sx={{ fontSize: 32, color: 'primary.main' }} />
                    <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: 'Poppins, sans-serif' }}>
                        AI 财务顾问
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={<AutoAwesome />}
                        onClick={generateAdvice}
                        sx={{ cursor: 'pointer', borderRadius: 2 }}
                    >
                        生成分析报告
                    </Button>
                    <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        startIcon={<Delete />}
                        onClick={handleClear}
                        sx={{ cursor: 'pointer', borderRadius: 2 }}
                    >
                        清空记录
                    </Button>
                </Box>
            </Box>

            {/* ProChat Container */}
            <Box
                sx={{
                    flexGrow: 1,
                    overflow: 'hidden',
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                    bgcolor: 'background.paper',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                    position: 'relative', // For absolute positioning of status
                    '& .ant-pro-chat-list': {
                        paddingBottom: '20px',
                    },
                    // Customize Message Bubbles
                    '& .ant-pro-chat-list-item-message-content': {
                        padding: '12px 16px',
                        borderRadius: '12px',
                    },
                    // User Message (Right)
                    '& .ant-pro-chat-list-item-right .ant-pro-chat-list-item-message-content': {
                        backgroundColor: '#E3F2FD', // Light Blue
                        borderBottomRightRadius: '4px',
                    },
                    // AI Message (Left)
                    '& .ant-pro-chat-list-item-left .ant-pro-chat-list-item-message-content': {
                        backgroundColor: '#F8FAFC', // Very Light Gray
                        border: `1px solid ${theme.palette.divider}`,
                        borderBottomLeftRadius: '4px',
                    },
                }}
            >
                {/* Tool Status Indicator */}
                {toolStatus && (
                    <Box
                        sx={{
                            position: 'absolute',
                            top: 16,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 10,
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            backdropFilter: 'blur(8px)',
                            border: `1px solid ${theme.palette.primary.light}`,
                            borderRadius: '20px',
                            padding: '6px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                            animation: 'fadeIn 0.3s ease-in-out',
                        }}
                    >
                        <CircularProgress size={14} thickness={5} />
                        <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
                            {toolStatus}
                        </Typography>
                    </Box>
                )}

                <ProChat
                    key={chatKey}
                    chatRef={chatRef}
                    style={{ height: '100%', background: 'transparent' }}
                    // Use a simple localized placeholder
                    inputAreaProps={{
                        placeholder: '请输入您的问题，例如："帮我分析一下上个月的餐饮支出"...',
                    }}
                    // Persist messages to localStorage
                    initialChats={(() => {
                        const saved = localStorage.getItem('pro_chat_history');
                        return saved ? JSON.parse(saved) : [];
                    })()}
                    onChatsChange={(chats) => {
                        localStorage.setItem('pro_chat_history', JSON.stringify(chats));
                    }}
                    // API Integration
                    request={async (messages) => {
                        try {
                            // Extract history (excluding the current user message being sent)
                            const history = messages.slice(0, -1).map(m => ({
                                role: m.role as 'user' | 'assistant',
                                content: typeof m.content === 'string' ? m.content : ''
                            }));
                            const lastMsg = messages[messages.length - 1];
                            const content = typeof lastMsg.content === 'string' ? lastMsg.content : '';

                            // Call our backend API
                            const response = await sendChatMessageStream(content, history);
                            const reader = response.body?.getReader();
                            const decoder = new TextDecoder();

                            if (!reader) return new Response("Error: No stream");

                            // Create a custom stream that filters out tool logs
                            const stream = new ReadableStream({
                                async start(controller) {
                                    while (true) {
                                        const { done, value } = await reader.read();
                                        if (done) {
                                            setToolStatus(null);
                                            controller.close();
                                            break;
                                        }

                                        const text = decoder.decode(value, { stream: true });

                                        // Debug: Log all incoming text
                                        console.log('Stream chunk:', JSON.stringify(text));

                                        // Check for tool markers
                                        // Simple check: splitting by lines to be safe against mixed chunks
                                        // Ideally we buffer, but for this specific strict backend format,
                                        // checking if the chunk *contains* the marker is likely enough for V1.
                                        // The backend sends distinct yields for these messages.

                                        if (text.includes("> 🔧 调用工具:")) {
                                            const match = text.match(/> 🔧 调用工具: (.*)/);
                                            console.log('Tool start detected:', match);
                                            if (match) setToolStatus(`正在调用工具: ${match[1].trim()}`);
                                            // Don't enqueue this text
                                            continue;
                                        }

                                        if (text.includes("> ✅ 工具")) {
                                            // Tool done
                                            console.log('Tool end detected');
                                            setToolStatus(null);
                                            continue;
                                        }

                                        // Regular content
                                        controller.enqueue(value);
                                    }
                                }
                            });

                            return new Response(stream);
                        } catch (error) {
                            console.error(error);
                            setToolStatus(null);
                            let detail = "抱歉，遇到了一些连接问题，请稍后重试。";
                            if (isAxiosError(error) && error.response?.data?.detail) {
                                detail = error.response.data.detail;
                            }
                            return new Response(detail);
                        }
                    }}
                    // Custom user/assistant metadata
                    userMeta={{
                        avatar: 'https://api.dicebear.com/7.x/miniavs/svg?seed=user',
                        title: '我',
                    }}
                    assistantMeta={{
                        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=smart-finance',
                        title: 'AI 顾问',
                        backgroundColor: '#3B82F6',
                    }}
                    locale="zh-CN"
                    actions={{
                        render: () => [],
                        flexConfig: {
                            gap: 24,
                            direction: 'horizontal',
                            justify: 'end',
                        },
                    }}
                />
            </Box>
        </Box>
    );
}
