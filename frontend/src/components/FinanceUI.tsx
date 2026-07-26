import { Box, Card, CardContent, Chip, Skeleton, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useHouseholdSettings } from '../contexts/HouseholdSettingsContext';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={2} sx={{ mb: 2.5 }}>
      <Box><Typography variant="h4" fontWeight={800} fontSize={{ xs: 25, md: 28 }}>{title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>{subtitle}</Typography></Box>
      {actions}
    </Stack>
  );
}

export function MetricCard({ label, value, hint, icon, tone = 'blue', loading = false, onClick }: {
  label: string; value: string; hint?: string; icon: ReactNode; tone?: 'blue' | 'green' | 'orange' | 'violet'; loading?: boolean; onClick?: () => void;
}) {
  const palette = {
    blue: ['#EAF2FF', '#2E6FDB'], green: ['#E9F8F1', '#168B5B'],
    orange: ['#FFF3E7', '#D97706'], violet: ['#F2ECFF', '#7353C7'],
  }[tone];
  return (
    <Card variant="outlined" onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') onClick(); } : undefined}
      sx={{ height: '100%', borderColor: '#E5EAF1', boxShadow: '0 2px 8px rgba(25,42,70,.035)', cursor: onClick ? 'pointer' : 'default', transition: 'border-color .15s, box-shadow .15s', '&:hover': onClick ? { borderColor: '#91B6ED', boxShadow: '0 5px 16px rgba(25,74,140,.1)' } : undefined }}>
      <CardContent sx={{ p: '18px !important' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box><Typography variant="body2" color="text.secondary" fontWeight={600}>{label}</Typography>{loading ? <Skeleton width={120} height={42} /> : <Typography fontSize={25} fontWeight={800} sx={{ mt: 0.6, letterSpacing: '-.02em' }}>{value}</Typography>}</Box>
          <Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: palette[0], color: palette[1], display: 'grid', placeItems: 'center' }}>{icon}</Box>
        </Stack>
        {hint && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.2 }}>{hint}</Typography>}
      </CardContent>
    </Card>
  );
}

export function SectionCard({ title, subtitle, action, children, minHeight }: {
  title: string; subtitle?: string; action?: ReactNode; children: ReactNode; minHeight?: number;
}) {
  return (
    <Card variant="outlined" sx={{ borderColor: '#E5EAF1', minHeight, boxShadow: '0 2px 8px rgba(25,42,70,.03)' }}>
      <CardContent sx={{ p: { xs: 2, md: 2.25 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
          <Box><Typography fontWeight={750}>{title}</Typography>{subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}</Box>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

export const RoleChip = ({ role }: { role: 'husband' | 'wife' | 'shared' }) => {
  const { roleLabels } = useHouseholdSettings();
  return <Chip size="small" label={roleLabels[role]}
    sx={{ bgcolor: role === 'shared' ? '#EEF3F8' : role === 'husband' ? '#EAF2FF' : '#F8ECF5', color: '#455468', fontWeight: 600 }} />;
};

export const EmptyState = ({ title, description }: { title: string; description: string }) => (
  <Box sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
    <Typography fontWeight={700} color="text.primary">{title}</Typography>
    <Typography variant="body2" sx={{ mt: 0.5 }}>{description}</Typography>
  </Box>
);
