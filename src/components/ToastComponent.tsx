import {Toast, useToastController, useToastState} from '@tamagui/toast';
import React, {useEffect} from 'react';
import {YStack} from 'tamagui';

import {ToastService} from '@/services/ToastService';

export default function ToastComponent() {
  const currentToast = useToastState();
  const toastController = useToastController();

  // Initialize the ToastService with the controller
  useEffect(() => {
    ToastService.initialize(toastController);
  }, [toastController]);

  if (!currentToast || currentToast.isHandledNatively) return null;

  return (
    <Toast
      animation="200ms"
      backgroundColor="$color3"
      borderColor="$color6"
      borderRadius="$4"
      borderWidth={1}
      duration={currentToast.duration}
      enterStyle={{opacity: 0, scale: 0.5, y: -25}}
      exitStyle={{opacity: 0, scale: 1, y: -20}}
      key={currentToast.id}
      opacity={1}
      scale={1}
      viewportName={currentToast.viewportName}
      y={0}>
      <YStack gap="$2" padding="$3">
        <Toast.Title color="$color12" fontSize="$5" fontWeight="600">
          {currentToast.title}
        </Toast.Title>
        {!!currentToast.message && (
          <Toast.Description color="$color11" fontSize="$4">
            {currentToast.message}
          </Toast.Description>
        )}
      </YStack>
    </Toast>
  );
}
