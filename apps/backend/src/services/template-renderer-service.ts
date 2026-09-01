import type { VariableType, TemplateVariable, TemplateVariableMapping } from '@prisma/client';

/**
 * WhatsApp Template Component Types
 */
export interface WhatsAppTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[][];
    header_handle?: string[];
  };
  buttons?: WhatsAppTemplateButton[];
}

export interface WhatsAppTemplateButton {
  type: 'URL' | 'PHONE_NUMBER' | 'QUICK_REPLY' | 'COPY_CODE' | 'OTP' | 'FLOW';
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[]; // For dynamic URL suffix
  flow_id?: string; // For flow buttons
  flow_action?: string; // For flow buttons (navigate or data_exchange)
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  components: WhatsAppTemplateComponent[];
}

/**
 * Rendered Template for Preview
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
export interface RenderedTemplate {
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    content: string;
  };
  body: string;
  footer?: string;
  buttons?: Array<{
    type: 'url' | 'phone_number' | 'quick_reply' | 'copy_code' | 'otp';
    text: string;
    url?: string;
    phoneNumber?: string;
  }>;
}

/**
 * WhatsApp API Template Payload
 * Requirements: 4.2, 4.3
 */
export interface WhatsAppTemplatePayload {
  name: string;
  language: { code: string };
  components: WhatsAppTemplateComponentPayload[];
}

export interface WhatsAppTemplateComponentPayload {
  type: 'header' | 'body' | 'button';
  sub_type?: 'url' | 'copy_code' | 'flow'; // For URL buttons, copy code buttons, and flow buttons
  index?: number; // For buttons
  parameters?: WhatsAppTemplateParameter[];
}

export interface WhatsAppTemplateParameter {
  type: 'text' | 'image' | 'video' | 'document' | 'currency' | 'date_time' | 'coupon_code' | 'action';
  text?: string;
  image?: { id?: string; link?: string };
  video?: { id?: string; link?: string };
  document?: { id?: string; link?: string; filename?: string };
  currency?: { fallback_value: string; code: string; amount_1000: number };
  date_time?: { fallback_value: string };
  coupon_code?: string; // For copy code buttons
  action?: { flow_token: string; flow_action_data?: Record<string, any> }; // For flow buttons
}

/**
 * Variable mapping with variable details
 */
export interface MappingWithVariable extends TemplateVariableMapping {
  variable: TemplateVariable;
}

/**
 * Variable value map for rendering
 */
export interface VariableValueMap {
  [variableId: string]: string;
}

/**
 * Error codes for template rendering
 */
export const TEMPLATE_RENDERER_ERRORS = {
  MISSING_VARIABLE_VALUE: 'Missing value for required variable',
  INVALID_TEMPLATE_STRUCTURE: 'Invalid template structure',
  MISSING_MAPPING: 'No mapping found for variable position',
  INVALID_MEDIA_TYPE: 'Invalid media type for header',
} as const;

/**
 * Check if variableValues uses index-based keys (e.g., "1", "2")
 * instead of variableId keys (e.g., cuid like "clx1234...")
 * 
 * Now also returns true if there are ANY numeric keys, even if mixed with
 * special keys like button_X, header_image, etc.
 */
export function isIndexBasedVariableValues(variableValues: VariableValueMap): boolean {
  const keys = Object.keys(variableValues);
  if (keys.length === 0) return false;
  
  // Check if ANY key is numeric (not just all keys)
  // This handles mixed cases like {"1": "val1", "2": "val2", "button_0_copy_code": "CODE"}
  const hasNumericKeys = keys.some(key => /^\d+$/.test(key));
  
  // Also check for special keys that indicate broadcast/direct sending (not mapping-based)
  const hasSpecialKeys = keys.some(key => 
    key.startsWith('button_') || 
    key.startsWith('header_') ||
    ['coupon_code', 'otp_code', 'copy_code'].includes(key)
  );
  
  return hasNumericKeys || hasSpecialKeys;
}

/**
 * Extract placeholder indices from text (e.g., "Hello {{1}}, your code is {{2}}" -> [1, 2])
 */
export function extractPlaceholderIndices(text: string): number[] {
  const matches = text.match(/\{\{(\d+)\}\}/g) || [];
  return matches.map(match => parseInt(match.replace(/\{|\}/g, ''), 10)).sort((a, b) => a - b);
}

/**
 * TemplateRendererService
 * 
 * Handles template rendering for preview and building WhatsApp API payloads.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.2, 4.3
 */
export class TemplateRendererService {
  // ============================================
  // Template Rendering for Preview (Requirements: 3.1, 3.2, 3.3, 3.4)
  // ============================================

  /**
   * Render template with variable values for preview
   * 
   * @param template - WhatsApp template structure
   * @param variableValues - Map of variableId to value
   * @param mappings - Variable mappings for the template
   * @returns Rendered template for preview
   * Requirements: 3.1, 3.2, 3.3, 3.4
   */
  renderTemplate(
    template: WhatsAppTemplate,
    variableValues: VariableValueMap,
    mappings: MappingWithVariable[]
  ): RenderedTemplate {
    const result: RenderedTemplate = {
      body: '',
    };

    for (const component of template.components) {
      switch (component.type) {
        case 'HEADER':
          result.header = this.renderHeader(component, variableValues, mappings);
          break;
        case 'BODY':
          result.body = this.renderBody(component, variableValues, mappings);
          break;
        case 'FOOTER':
          result.footer = component.text || '';
          break;
        case 'BUTTONS':
          result.buttons = this.renderButtons(component, variableValues, mappings);
          break;
      }
    }

    return result;
  }

  /**
   * Render header component
   * Requirements: 3.3
   *
   * Supports index-based variableValues with special keys:
   * - "header_image", "header_video", "header_document", or just "header" for media headers
   */
  private renderHeader(
    component: WhatsAppTemplateComponent,
    variableValues: VariableValueMap,
    mappings: MappingWithVariable[]
  ): RenderedTemplate['header'] {
    const format = component.format?.toLowerCase() as 'text' | 'image' | 'video' | 'document';

    if (format === 'text') {
      // Text header with possible variables
      const headerMappings = mappings.filter(m => m.componentType === 'header');
      const text = this.replaceVariablesInText(
        component.text || '',
        headerMappings,
        variableValues
      );
      return { type: 'text', content: text };
    }

    // Media header (image, video, document)
    const headerMapping = mappings.find(
      m => m.componentType === 'header' && m.parameterIndex === 0
    );

    if (headerMapping && variableValues[headerMapping.variableId]) {
      return {
        type: format || 'image',
        content: variableValues[headerMapping.variableId],
      };
    }

    // Check for index-based media header values
    const mediaKey = `header_${format}`;
    const mediaValue = variableValues[mediaKey] || variableValues['header'];
    if (mediaValue) {
      return {
        type: format || 'image',
        content: mediaValue,
      };
    }

    // Return example or empty
    return {
      type: format || 'image',
      content: component.example?.header_handle?.[0] || '',
    };
  }

  /**
   * Render body component with variable replacement
   * Requirements: 3.2
   */
  private renderBody(
    component: WhatsAppTemplateComponent,
    variableValues: VariableValueMap,
    mappings: MappingWithVariable[]
  ): string {
    const bodyMappings = mappings.filter(m => m.componentType === 'body');
    return this.replaceVariablesInText(
      component.text || '',
      bodyMappings,
      variableValues
    );
  }

  /**
   * Render buttons with dynamic URL construction
   * Requirements: 3.4
   *
   * Supports index-based variableValues with "button_0", "button_1" keys for URL buttons
   * and "button_X_copy_code" for copy code buttons
   */
  private renderButtons(
    component: WhatsAppTemplateComponent,
    variableValues: VariableValueMap,
    mappings: MappingWithVariable[]
  ): RenderedTemplate['buttons'] {
    if (!component.buttons) return [];

    const useIndexBased = isIndexBasedVariableValues(variableValues) ||
      Object.keys(variableValues).some(k => k.startsWith('button_'));

    return component.buttons.map((button, index) => {
      const buttonType = button.type.toLowerCase() as 'url' | 'phone_number' | 'quick_reply' | 'copy_code' | 'otp';

      const result: NonNullable<RenderedTemplate['buttons']>[number] = {
        type: buttonType,
        text: button.text,
      };

      if (buttonType === 'url' && button.url) {
        let buttonValue: string | undefined;

        if (useIndexBased) {
          // Index-based: use "button_0", "button_1" keys
          buttonValue = variableValues[`button_${index}`];
        } else {
          // Check for dynamic URL variable mapping
          const buttonMapping = mappings.find(
            m => m.componentType === 'button' && m.componentIndex === index
          );

          if (buttonMapping) {
            buttonValue = variableValues[buttonMapping.variableId];
          }
        }

        if (buttonValue) {
          // Dynamic URL: base URL + variable suffix
          result.url = button.url.replace('{{1}}', buttonValue);
        } else {
          result.url = button.url;
        }
      } else if (buttonType === 'phone_number') {
        result.phoneNumber = button.phone_number;
      }

      return result;
    });
  }

  /**
   * Replace variable placeholders in text with actual values
   * Handles {{1}}, {{2}}, etc. placeholders
   *
   * Supports two modes:
   * 1. With mappings: Uses variableId-based variableValues
   * 2. Without mappings: Uses index-based variableValues directly (e.g., {"1": "value1"})
   */
  private replaceVariablesInText(
    text: string,
    mappings: MappingWithVariable[],
    variableValues: VariableValueMap
  ): string {
    let result = text;

    // Check if using index-based values directly
    if (mappings.length === 0 && isIndexBasedVariableValues(variableValues)) {
      // Direct replacement using index keys
      const placeholderIndices = extractPlaceholderIndices(text);
      for (const index of placeholderIndices) {
        const placeholder = `{{${index}}}`;
        const value = variableValues[index.toString()] || '';
        result = result.replace(placeholder, value);
      }
      return result;
    }

    // Sort mappings by parameterIndex to ensure correct replacement order
    const sortedMappings = [...mappings].sort((a, b) => a.parameterIndex - b.parameterIndex);

    for (const mapping of sortedMappings) {
      // parameterIndex stored as 1-based to mirror Meta placeholders
      const placeholder = `{{${mapping.parameterIndex}}}`;
      const value = variableValues[mapping.variableId] || '';
      result = result.replace(placeholder, value);
    }

    return result;
  }

  // ============================================
  // WhatsApp API Payload Building (Requirements: 4.2, 4.3)
  // ============================================

  /**
   * Build WhatsApp API payload for sending template
   * 
   * @param templateName - WhatsApp template name
   * @param languageCode - Template language code
   * @param template - WhatsApp template structure
   * @param variableValues - Map of variableId to value
   * @param mappings - Variable mappings for the template
   * @returns WhatsApp API template payload
   * Requirements: 4.2, 4.3
   */
  buildTemplatePayload(
    templateName: string,
    languageCode: string,
    template: WhatsAppTemplate,
    variableValues: VariableValueMap,
    mappings: MappingWithVariable[]
  ): WhatsAppTemplatePayload {
    const payload: WhatsAppTemplatePayload = {
      name: templateName,
      language: { code: languageCode },
      components: [],
    };

    // Check if this is an authentication template with copy code button
    const isAuthTemplate = template.category === 'AUTHENTICATION';
    const otpCode = isAuthTemplate ? this.findOtpCodeValue(variableValues) : undefined;

    for (const component of template.components) {
      switch (component.type) {
        case 'HEADER':
          const headerPayload = this.buildHeaderPayload(component, variableValues, mappings);
          if (headerPayload) {
            payload.components.push(headerPayload);
          }
          break;
        case 'BODY':
          const bodyPayload = this.buildBodyPayload(component, variableValues, mappings);
          if (bodyPayload) {
            payload.components.push(bodyPayload);
          } else if (isAuthTemplate && otpCode) {
            // For authentication templates, always add body with OTP code
            // even if buildBodyPayload returns null
            payload.components.push({
              type: 'body',
              parameters: [{ type: 'text', text: otpCode }],
            });
          }
          break;
        case 'BUTTONS':
          const buttonPayloads = this.buildButtonPayloads(component, variableValues, mappings);
          payload.components.push(...buttonPayloads);
          break;
        // FOOTER doesn't have variables, so no payload needed
      }
    }

    return payload;
  }

  /**
   * Build header component payload
   * Requirements: 4.2
   *
   * Supports two modes:
   * 1. With mappings: Uses variableId-based variableValues (existing behavior)
   * 2. Without mappings: Uses index-based variableValues for TEXT headers,
   *    or special keys like "header_image", "header_video", "header_document" for media headers
   */
  private buildHeaderPayload(
    component: WhatsAppTemplateComponent,
    variableValues: VariableValueMap,
    mappings: MappingWithVariable[]
  ): WhatsAppTemplateComponentPayload | null {
    const headerMappings = mappings.filter(m => m.componentType === 'header');
    const format = component.format?.toLowerCase();
    const parameters: WhatsAppTemplateParameter[] = [];

    // Check if using index-based variableValues (no mappings needed)
    if (headerMappings.length === 0 && isIndexBasedVariableValues(variableValues)) {
      if (format === 'text' && component.text) {
        // Text header with placeholders
        const placeholderIndices = extractPlaceholderIndices(component.text);
        for (const index of placeholderIndices) {
          const value = variableValues[index.toString()];
          if (!value) continue;
          const param = this.buildParameter('TEXT', value);
          parameters.push(param);
        }
      }
      // Media headers (IMAGE, VIDEO, DOCUMENT) - check for special keys
      else if (['image', 'video', 'document'].includes(format || '')) {
        const mediaKey = `header_${format}`;
        const value = variableValues[mediaKey] || variableValues['header'];
        if (value) {
          const variableType = format?.toUpperCase() as 'IMAGE' | 'VIDEO' | 'DOCUMENT';
          const param = this.buildParameter(variableType, value);
          parameters.push(param);
        }
      }
    } else if (headerMappings.length > 0) {
      // Use mapping-based approach (existing behavior)
      for (const mapping of headerMappings) {
        const value = variableValues[mapping.variableId];
        if (!value) continue;

        const variableType = mapping.variable.type;
        const param = this.buildParameter(variableType, value, format);
        parameters.push(param);
      }
    }

    if (parameters.length === 0) {
      return null;
    }

    return {
      type: 'header',
      parameters,
    };
  }

  /**
   * Build body component payload
   * Requirements: 4.2
   *
   * Supports two modes:
   * 1. With mappings: Uses variableId-based variableValues (existing behavior)
   * 2. Without mappings: Uses index-based variableValues (e.g., {"1": "value1", "2": "value2"})
   * 
   * Special handling for authentication templates:
   * - Authentication templates may not have {{1}} placeholder in body text
   * - But still need body parameter with OTP code
   * - Check for button_X_copy_code, coupon_code, or otp_code keys
   */
  private buildBodyPayload(
    component: WhatsAppTemplateComponent,
    variableValues: VariableValueMap,
    mappings: MappingWithVariable[]
  ): WhatsAppTemplateComponentPayload | null {
    const bodyMappings = mappings
      .filter(m => m.componentType === 'body')
      .sort((a, b) => a.parameterIndex - b.parameterIndex);

    const parameters: WhatsAppTemplateParameter[] = [];

    // Check if using index-based variableValues (no mappings needed)
    if (bodyMappings.length === 0 && isIndexBasedVariableValues(variableValues)) {
      // Extract placeholders from template body text
      const placeholderIndices = extractPlaceholderIndices(component.text || '');

      if (placeholderIndices.length === 0) {
        // No placeholders found - check if this is an authentication template
        // Authentication templates need OTP code in body even without {{1}} placeholder
        const otpCode = this.findOtpCodeValue(variableValues);
        if (otpCode) {
          parameters.push({ type: 'text', text: otpCode });
        } else {
          return null; // No variables in template body
        }
      } else {
        // Build parameters from index-based values (numeric keys only!)
        // This ensures button_X_copy_code doesn't get mixed in
        for (const index of placeholderIndices) {
          const value = variableValues[index.toString()] || '';
          if (!value) {
            // Log warning if value is missing for a placeholder
            console.warn(`Missing value for body placeholder {{${index}}}`);
          }
          // Default to TEXT type for index-based values
          const param = this.buildParameter('TEXT', value);
          parameters.push(param);
        }
      }
    } else if (bodyMappings.length > 0) {
      // Use mapping-based approach (existing behavior)
      for (const mapping of bodyMappings) {
        const value = variableValues[mapping.variableId] || '';
        const variableType = mapping.variable.type;
        const param = this.buildParameter(variableType, value);
        parameters.push(param);
      }
    } else {
      // No mappings and not strictly index-based - check for OTP code
      const otpCode = this.findOtpCodeValue(variableValues);
      if (otpCode) {
        parameters.push({ type: 'text', text: otpCode });
      } else {
        return null; // No mappings and no OTP code
      }
    }

    if (parameters.length === 0) {
      return null;
    }

    return {
      type: 'body',
      parameters,
    };
  }

  /**
   * Find OTP/copy code value from variableValues
   * Checks various key patterns used for authentication templates
   */
  private findOtpCodeValue(variableValues: VariableValueMap): string | undefined {
    // Check for various key patterns
    const otpKeys = [
      'coupon_code',
      'otp_code',
      'copy_code',
      ...Object.keys(variableValues).filter(k => k.includes('_copy_code'))
    ];
    
    for (const key of otpKeys) {
      if (variableValues[key]) {
        return variableValues[key];
      }
    }
    
    return undefined;
  }

  /**
   * Build button component payloads for dynamic URL buttons and copy code buttons
   * Requirements: 4.3
   *
   * Supports two modes:
   * 1. With mappings: Uses variableId-based variableValues (existing behavior)
   * 2. Without mappings: Uses special keys like "button_0", "button_1" for URL button variables
   *    and "button_X_copy_code" for copy code buttons
   */
  private buildButtonPayloads(
    component: WhatsAppTemplateComponent,
    variableValues: VariableValueMap,
    mappings: MappingWithVariable[]
  ): WhatsAppTemplateComponentPayload[] {
    const payloads: WhatsAppTemplateComponentPayload[] = [];

    if (!component.buttons) return payloads;

    const useIndexBased = isIndexBasedVariableValues(variableValues) ||
      Object.keys(variableValues).some(k => k.startsWith('button_'));

    for (let index = 0; index < component.buttons.length; index++) {
      const button = component.buttons[index];

      // Handle Copy Code / OTP buttons
      // Per Meta documentation: copy code buttons use sub_type: 'copy_code' and parameter with coupon_code field
      // See: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages#template-object
      if (button.type === 'COPY_CODE' || button.type === 'OTP') {
        // Check for copy code value
        const copyCodeValue = variableValues[`button_${index}_copy_code`] || 
                             variableValues['coupon_code'] ||
                             variableValues['otp_code'];
        
        if (copyCodeValue) {
          payloads.push({
            type: 'button',
            sub_type: 'copy_code',
            index,
            parameters: [{
              type: 'coupon_code',
              coupon_code: copyCodeValue,
            }],
          });
        }
        continue;
      }

      // Handle Flow buttons
      // Per Meta documentation: flow buttons use sub_type: 'flow' with action parameter
      // See: https://developers.facebook.com/docs/whatsapp/flows/gettingstarted/sendingaflow
      if (button.type === 'FLOW') {
        // Get optional flow_token and flow_action_data from variableValues
        const flowToken = variableValues[`button_${index}_flow_token`] || 
                         variableValues['flow_token'] ||
                         'unused'; // Default per Meta docs
        
        const flowActionDataStr = variableValues[`button_${index}_flow_action_data`] || 
                                  variableValues['flow_action_data'];
        
        let flowActionData: Record<string, any> = {};
        if (flowActionDataStr) {
          try {
            flowActionData = typeof flowActionDataStr === 'string' 
              ? JSON.parse(flowActionDataStr) 
              : flowActionDataStr;
          } catch {
            // If parsing fails, use empty object
            flowActionData = {};
          }
        }

        payloads.push({
          type: 'button',
          sub_type: 'flow',
          index,
          parameters: [{
            type: 'action',
            action: {
              flow_token: flowToken,
              flow_action_data: flowActionData,
            },
          }],
        });
        continue;
      }

      // Handle URL buttons with dynamic parameters
      if (button.type !== 'URL') continue;

      // Check if URL has a variable placeholder
      if (!button.url?.includes('{{1}}')) continue;

      let value: string | undefined;

      if (useIndexBased) {
        // Index-based: use "button_0", "button_1" keys
        value = variableValues[`button_${index}`];
      } else {
        // Check if this button has a variable mapping
        const buttonMapping = mappings.find(
          m => m.componentType === 'button' && m.componentIndex === index
        );

        if (buttonMapping) {
          value = variableValues[buttonMapping.variableId];
        }
      }

      if (!value) continue;

      payloads.push({
        type: 'button',
        sub_type: 'url',
        index,
        parameters: [{
          type: 'text',
          text: value,
        }],
      });
    }

    return payloads;
  }

  /**
   * Build parameter based on variable type
   */
  private buildParameter(
    variableType: VariableType,
    value: string,
    headerFormat?: string
  ): WhatsAppTemplateParameter {
    switch (variableType) {
      case 'IMAGE':
        // Check if value is a media_id (no URL scheme) or a link
        if (this.isMediaId(value)) {
          return { type: 'image', image: { id: value } };
        }
        return { type: 'image', image: { link: value } };
      
      case 'VIDEO':
        if (this.isMediaId(value)) {
          return { type: 'video', video: { id: value } };
        }
        return { type: 'video', video: { link: value } };
      
      case 'DOCUMENT':
        if (this.isMediaId(value)) {
          return { type: 'document', document: { id: value } };
        }
        return { type: 'document', document: { link: value } };
      
      case 'CURRENCY':
        // Parse currency value (expected format: "IDR 100000" or just "100000")
        const currencyMatch = value.match(/^([A-Z]{3})?\s*(\d+(?:\.\d+)?)$/);
        if (currencyMatch) {
          const code = currencyMatch[1] || 'IDR';
          const amount = parseFloat(currencyMatch[2]);
          return {
            type: 'currency',
            currency: {
              fallback_value: value,
              code,
              amount_1000: Math.round(amount * 1000),
            },
          };
        }
        // Fallback to text if parsing fails
        return { type: 'text', text: value };
      
      case 'DATE':
        // Date should be passed as fallback_value
        return {
          type: 'date_time',
          date_time: { fallback_value: value },
        };
      
      case 'URL':
      case 'TEXT':
      default:
        return { type: 'text', text: value };
    }
  }

  /**
   * Check if value is a WhatsApp media_id (not a URL)
   * Media IDs are typically numeric strings without URL scheme
   */
  private isMediaId(value: string): boolean {
    // Media IDs don't contain URL schemes
    return !value.startsWith('http://') && !value.startsWith('https://');
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Extract variable positions from template
   * Useful for creating initial mappings
   */
  extractVariablePositions(template: WhatsAppTemplate): Array<{
    componentType: string;
    componentIndex: number;
    parameterIndex: number;
    format?: string;
  }> {
    const positions: Array<{
      componentType: string;
      componentIndex: number;
      parameterIndex: number;
      format?: string;
    }> = [];

    for (const component of template.components) {
      switch (component.type) {
        case 'HEADER':
          if (component.format === 'TEXT' && component.text) {
            const matches = component.text.match(/\{\{\d+\}\}/g) || [];
            matches.forEach((match) => {
              const number = parseInt(match.replace(/\{|\}/g, ''), 10);
              if (!Number.isNaN(number)) {
                positions.push({
                  componentType: 'header',
                  componentIndex: 0,
                  parameterIndex: number,
                  format: 'TEXT',
                });
              }
            });
          } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(component.format || '')) {
            // Media headers have one variable position
            positions.push({
              componentType: 'header',
              componentIndex: 0,
              parameterIndex: 0,
              format: component.format,
            });
          }
          break;
        
        case 'BODY':
          if (component.text) {
            const matches = component.text.match(/\{\{\d+\}\}/g) || [];
            matches.forEach((match) => {
              const number = parseInt(match.replace(/\{|\}/g, ''), 10);
              if (!Number.isNaN(number)) {
                positions.push({
                  componentType: 'body',
                  componentIndex: 0,
                  parameterIndex: number,
                });
              }
            });
          }
          break;
        
        case 'BUTTONS':
          component.buttons?.forEach((button, buttonIndex) => {
            if (button.type === 'URL' && button.url?.includes('{{1}}')) {
              positions.push({
                componentType: 'button',
                componentIndex: buttonIndex,
                parameterIndex: 0,
              });
            }
            // Copy code / OTP buttons have one variable (the code)
            if (button.type === 'COPY_CODE' || button.type === 'OTP') {
              positions.push({
                componentType: 'button',
                componentIndex: buttonIndex,
                parameterIndex: 0,
                format: button.type,
              });
            }
          });
          break;
      }
    }

    return positions;
  }

  /**
   * Count total variables in template
   */
  countVariables(template: WhatsAppTemplate): number {
    return this.extractVariablePositions(template).length;
  }
}

// Export singleton instance
export const templateRendererService = new TemplateRendererService();
