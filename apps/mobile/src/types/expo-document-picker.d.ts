declare module 'expo-document-picker' {
  export type DocumentPickerAsset = {
    uri: string;
    name?: string | null;
    mimeType?: string | null;
    size?: number | null;
  };

  export type DocumentPickerResult =
    | { canceled: true; assets?: never }
    | { canceled: false; assets: DocumentPickerAsset[] };

  export function getDocumentAsync(options: {
    type?: string | string[];
    multiple?: boolean;
    copyToCacheDirectory?: boolean;
  }): Promise<DocumentPickerResult>;
}
