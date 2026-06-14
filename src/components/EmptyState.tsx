import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type EmptyStateProps = {
  icon: LucideIcon;
  iconName: string;
  title: string;
  detail: string;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, iconName, title, detail, action }: EmptyStateProps) {
  return (
    <section
      data-testid="dashboard-empty-state"
      data-empty-icon={iconName}
      className="flex min-h-[26rem] flex-col items-center justify-center px-6 py-12 text-center"
    >
      <Icon className="mb-5 h-16 w-16 text-gray-300 dark:text-ios-700" />
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="mt-3 max-w-md text-sm text-gray-500 dark:text-ios-400">{detail}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
