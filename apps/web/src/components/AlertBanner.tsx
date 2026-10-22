import React from 'react';

export type AlertType = 'sucesso' | 'erro' | 'advertencia' | 'info';

interface AlertBannerProps {
  type: AlertType;
  title?: string;
  message: string;
  className?: string;
}

export function AlertBanner({ type, title, message, className = '' }: AlertBannerProps) {
  let containerClasses = '';
  let borderClasses = '';
  let textClasses = '';

  switch (type) {
    case 'sucesso':
      containerClasses = 'bg-success-soft text-success-ink';
      borderClasses = 'border-l-4 border-success';
      textClasses = 'text-success-ink';
      break;
    case 'erro':
      containerClasses = 'bg-danger-soft text-danger-ink';
      borderClasses = 'border-l-4 border-danger';
      textClasses = 'text-danger-ink';
      break;
    case 'advertencia':
      containerClasses = 'bg-warning-soft text-warning-ink';
      borderClasses = 'border-l-4 border-warning';
      textClasses = 'text-warning-ink';
      break;
    case 'info':
    default:
      containerClasses = 'bg-info-soft text-primary';
      borderClasses = 'border-l-4 border-primary';
      textClasses = 'text-primary';
      break;
  }

  return (
    <div
      role={type === 'erro' ? 'alert' : 'status'}
      aria-live={type === 'erro' ? 'assertive' : 'polite'}
      className={`p-3.5 rounded-control ${containerClasses} ${borderClasses} ${className} flex items-start space-x-3`}
    >
      <div className="flex-1 text-sm">
        {title && <span className="font-bold block mb-0.5">{title}</span>}
        <span className={textClasses}>{message}</span>
      </div>
    </div>
  );
}
