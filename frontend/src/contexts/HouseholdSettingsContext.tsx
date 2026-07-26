/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Role, type Settings } from '../api';

export const fallbackSettings: Settings = {
  husband_name: '丈夫',
  wife_name: '妻子',
  default_role: 'shared',
  api_key: '',
  base_url: 'https://openrouter.ai/api/v1',
  model_name: 'openai/gpt-5.6-luna',
  llm_extraction_enabled: true,
  language: '简体中文',
};

interface HouseholdSettingsValue {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  roleLabels: Record<Role, string>;
}

const HouseholdSettingsContext = createContext<HouseholdSettingsValue | null>(null);

export function HouseholdSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(fallbackSettings);

  useEffect(() => {
    api.get<Settings>('/settings').then((response) => setSettings(response.data)).catch(() => undefined);
  }, []);

  const roleLabels = useMemo<Record<Role, string>>(() => ({
    shared: '家庭共享',
    husband: settings.husband_name.trim() || '丈夫',
    wife: settings.wife_name.trim() || '妻子',
  }), [settings.husband_name, settings.wife_name]);

  return (
    <HouseholdSettingsContext.Provider value={{ settings, setSettings, roleLabels }}>
      {children}
    </HouseholdSettingsContext.Provider>
  );
}

export function useHouseholdSettings() {
  const value = useContext(HouseholdSettingsContext);
  if (!value) throw new Error('useHouseholdSettings must be used within HouseholdSettingsProvider');
  return value;
}
