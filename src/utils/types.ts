export interface ExtensionPreferences {
  pdfOCR: boolean;
  modelEndpoint: string;
  authType: string;
  apiKey: string;
  inputSchema: string;
  outputKeyPath: string;
  outputTiming: string;
}

/**
 * User-customizable options for PromptLab commands.
 */
export interface CommandOptions {
  minNumFiles?: number;
  acceptedFileExtensions?: string[];
  useMetadata?: boolean;
  useSoundClassification?: boolean;
  useAudioDetails?: boolean;
  useSubjectClassification?: boolean;
  useRectangleDetection?: boolean;
  useBarcodeDetection?: boolean;
  useFaceDetection?: boolean;
  outputKind?: string;
  actionScript?: string;
  showResponse?: boolean;
  useSaliencyAnalysis?: boolean;
}

/**
 * A PromptLab command.
 */
export interface Command {
  name: string;
  prompt: string;
  icon: string;
  iconColor?: string;
  minNumFiles?: string;
  acceptedFileExtensions?: string;
  useMetadata?: boolean;
  useSoundClassification?: boolean;
  useAudioDetails?: boolean;
  useSubjectClassification?: boolean;
  useRectangleDetection?: boolean;
  useBarcodeDetection?: boolean;
  useFaceDetection?: boolean;
  outputKind?: string;
  actionScript?: string;
  showResponse?: boolean;
  description?: string;
  useSaliencyAnalysis?: boolean;
}

/**
 * A command response from SlashAPI.
 */
export interface StoreCommand {
  name: string;
  prompt: string;
  icon: string;
  iconColor?: string;
  minNumFiles?: string;
  acceptedFileExtensions?: string;
  useMetadata?: string;
  useSoundClassification?: string;
  useAudioDetails?: string;
  useSubjectClassification?: string;
  useRectangleDetection?: string;
  useBarcodeDetection?: string;
  useFaceDetection?: string;
  outputKind?: string;
  actionScript?: string;
  showResponse?: string;
  description?: string;
  useSaliencyAnalysis?: string;
  exampleOutput?: string;
}

/** Output from a model endpoint */
export interface modelOutput {
  [key: string]: string | modelOutput;
}