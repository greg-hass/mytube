import type { ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  detail: string;
  action?: ReactNode;
};

export function EmptyState({ title, detail, action }: EmptyStateProps) {
  return (
    <section className="rounded-lg border border-dashed border-gray-200 px-6 py-10 text-center dark:border-gray-800">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{detail}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}
