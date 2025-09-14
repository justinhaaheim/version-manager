import type {useToastController} from '@tamagui/toast';

// Global toast controller reference
let globalToastController: ReturnType<typeof useToastController> | null = null;

export const ToastService = {
  // Hide current toast
  hide: () => {
    if (globalToastController) {
      globalToastController.hide();
    }
  },

  // Initialize the toast controller (called from a component that has access to the hook)
  initialize: (controller: ReturnType<typeof useToastController>) => {
    globalToastController = controller;
  },

  // Show an error toast
  showError: (title: string, message?: string) => {
    if (globalToastController) {
      globalToastController.show(title, {
        message,
        native: ['ios'], // Use native iOS toast for better UX
      });
    } else {
      console.warn('ToastService not initialized');
    }
  },

  // Show an info toast
  showInfo: (title: string, message?: string) => {
    if (globalToastController) {
      globalToastController.show(title, {
        message,
        native: ['ios'], // Use native iOS toast for better UX
      });
    } else {
      console.warn('ToastService not initialized');
    }
  },

  // Show a success toast
  showSuccess: (title: string, message?: string) => {
    if (globalToastController) {
      globalToastController.show(title, {
        message,
        native: ['ios'], // Use native iOS toast for better UX
      });
    } else {
      console.warn('ToastService not initialized');
    }
  },
};
