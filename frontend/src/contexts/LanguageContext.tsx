import { createContext, useContext, useState, type ReactNode } from 'react';
import { zh } from '../locales/zh';
import { en } from '../locales/en';

type Language = 'zh' | 'en';

interface LanguageContextType {
    language: Language;
    toggleLanguage: () => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguage] = useState<Language>('zh');

    const translations = language === 'zh' ? zh : en;

    const toggleLanguage = () => {
        setLanguage((prev) => (prev === 'zh' ? 'en' : 'zh'));
    };

    // Helper to access nested keys like "navbar.title"
    const t = (path: string): string => {
        const keys = path.split('.');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let current: any = translations;

        for (const key of keys) {
            if (current[key] === undefined) {
                console.warn(`Missing translation for key: ${path}`);
                return path;
            }
            current = current[key];
        }

        return current as string;
    };

    return (
        <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
