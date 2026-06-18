import { useCallback, useState } from 'react';
import { showErrorToast } from '../utils/toast';

interface ZipDownloadState {
  downloading: boolean;
  downloaded: boolean;
  download: () => Promise<void>;
  resetDownload: () => void;
}

/**
 * Загальний хук для паттерну «завантажити ZIP-пакет».
 * Інкапсулює стани downloading/downloaded та обробку помилок.
 */
export function useZipDownload(
  downloadFn: () => Promise<void>,
  errorTitle = 'Не вдалося підготувати ZIP-пакет',
): ZipDownloadState {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const download = useCallback(async () => {
    setDownloading(true);
    try {
      await downloadFn();
      setDownloaded(true);
    } catch (err) {
      showErrorToast(errorTitle, err);
    } finally {
      setDownloading(false);
    }
  }, [downloadFn, errorTitle]);

  const resetDownload = useCallback(() => {
    setDownloaded(false);
  }, []);

  return { downloading, downloaded, download, resetDownload };
}
