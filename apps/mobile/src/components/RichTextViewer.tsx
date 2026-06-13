import React from 'react';
import { View, Text, Platform, Linking, StyleSheet } from 'react-native';

interface HTMLNode {
  type: 'text' | 'tag';
  name?: string;
  attributes?: Record<string, string>;
  children?: HTMLNode[];
  content?: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&trade;/g, '™')
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®');
}

function parseAttributes(attrString: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9:-]+)(?:\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s>]+)))?/g;
  let match;
  while ((match = attrRegex.exec(attrString)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2] || match[3] || match[4] || '';
    attributes[key] = value;
  }
  return attributes;
}

function parseHTML(html: string): HTMLNode[] {
  const nodes: HTMLNode[] = [];
  const tagRegex = /<(?:\/([a-zA-Z1-6]+)|([a-zA-Z1-6]+)(?:\s+([^>]*))?)>/g;
  let lastIndex = 0;
  let match;

  const stack: { name: string; attributes: Record<string, string>; children: HTMLNode[] }[] = [];
  let currentChildren = nodes;

  while ((match = tagRegex.exec(html)) !== null) {
    const textBefore = html.substring(lastIndex, match.index);
    if (textBefore) {
      const decoded = decodeEntities(textBefore);
      currentChildren.push({ type: 'text', content: decoded });
    }

    const isEndTag = !!match[1];
    const tagName = (match[1] || match[2] || '').toLowerCase();
    const attrString = match[3] || '';

    if (isEndTag) {
      const stackIndex = stack.map(s => s.name).lastIndexOf(tagName);
      if (stackIndex !== -1) {
        const popped = stack.splice(stackIndex);
        const item = popped[0];
        currentChildren = stack.length > 0 ? stack[stack.length - 1].children : nodes;
        currentChildren.push({
          type: 'tag',
          name: item.name,
          attributes: item.attributes,
          children: item.children,
        });
      }
    } else {
      const isSelfClosing = attrString.endsWith('/') || ['br', 'img', 'hr'].includes(tagName);
      const cleanAttrString = isSelfClosing && attrString.endsWith('/') ? attrString.slice(0, -1) : attrString;
      const attributes = parseAttributes(cleanAttrString);

      if (isSelfClosing) {
        currentChildren.push({
          type: 'tag',
          name: tagName,
          attributes,
          children: [],
        });
      } else {
        const newTag = { name: tagName, attributes, children: [] };
        stack.push(newTag);
        currentChildren = newTag.children;
      }
    }

    lastIndex = tagRegex.lastIndex;
  }

  const textAfter = html.substring(lastIndex);
  if (textAfter) {
    currentChildren.push({ type: 'text', content: decodeEntities(textAfter) });
  }

  while (stack.length > 0) {
    const item = stack.pop()!;
    currentChildren = stack.length > 0 ? stack[stack.length - 1].children : nodes;
    currentChildren.push({
      type: 'tag',
      name: item.name,
      attributes: item.attributes,
      children: item.children,
    });
  }

  return nodes;
}

function parseInlineStyle(styleString?: string): any {
  if (!styleString) return {};
  const styles: any = {};
  const rules = styleString.split(';');
  for (const rule of rules) {
    const parts = rule.split(':');
    if (parts.length === 2) {
      const key = parts[0].trim().toLowerCase();
      const value = parts[1].trim();

      if (key === 'color') {
        styles.color = value;
      } else if (key === 'background-color') {
        styles.backgroundColor = value;
      } else if (key === 'font-weight') {
        styles.fontWeight = value;
      } else if (key === 'font-style') {
        styles.fontStyle = value;
      } else if (key === 'text-decoration') {
        if (value.includes('line-through')) {
          styles.textDecorationLine = 'line-through';
        } else if (value.includes('underline')) {
          styles.textDecorationLine = 'underline';
        }
      } else if (key === 'font-size') {
        const pxMatch = value.match(/^(\d+)px$/);
        if (pxMatch) {
          styles.fontSize = parseInt(pxMatch[1], 10);
        }
      }
    }
  }
  return styles;
}

function isInlineNode(node: HTMLNode): boolean {
  if (node.type === 'text') return true;
  const inlineTags = ['span', 'strong', 'b', 'em', 'i', 'u', 'a', 'code'];
  return inlineTags.includes(node.name || '');
}

interface RichTextViewerProps {
  html?: string;
  defaultTextColor?: string;
  fallback?: string;
}

export function RichTextViewer({ html = '', defaultTextColor = '#D1D1D1', fallback = '-' }: RichTextViewerProps) {
  if (!html || !html.trim()) {
    return <Text style={{ color: defaultTextColor }}>{fallback}</Text>;
  }

  const nodes = parseHTML(html);

  const renderNode = (node: HTMLNode, index: number, parentStyle: any = {}): React.ReactNode => {
    if (node.type === 'text') {
      return (
        <Text key={index} style={parentStyle}>
          {node.content}
        </Text>
      );
    }

    const tagName = node.name || '';
    const inlineStyles = parseInlineStyle(node.attributes?.style);
    const combinedStyle = { ...parentStyle, ...inlineStyles };

    if (tagName === 'strong' || tagName === 'b') {
      combinedStyle.fontWeight = 'bold';
    } else if (tagName === 'em' || tagName === 'i') {
      combinedStyle.fontStyle = 'italic';
    } else if (tagName === 'u') {
      combinedStyle.textDecorationLine = combinedStyle.textDecorationLine
        ? combinedStyle.textDecorationLine === 'line-through'
          ? 'underline line-through'
          : 'underline'
        : 'underline';
    } else if (tagName === 'code') {
      combinedStyle.fontFamily = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
      combinedStyle.backgroundColor = 'rgba(255, 255, 255, 0.08)';
      combinedStyle.paddingHorizontal = 4;
      combinedStyle.paddingVertical = 2;
      combinedStyle.borderRadius = 4;
      combinedStyle.fontSize = 13;
    } else if (tagName === 'a') {
      combinedStyle.color = '#007AFF';
      combinedStyle.textDecorationLine = 'underline';
    }

    const handleLinkPress = () => {
      const href = node.attributes?.href;
      if (href) {
        Linking.openURL(href).catch(err => console.error('Failed to open link', err));
      }
    };

    if (tagName === 'a') {
      return (
        <Text key={index} style={combinedStyle} onPress={handleLinkPress}>
          {node.children?.map((child, idx) => renderNode(child, idx, combinedStyle))}
        </Text>
      );
    }

    if (isInlineNode(node)) {
      return (
        <Text key={index} style={combinedStyle}>
          {node.children?.map((child, idx) => renderNode(child, idx, combinedStyle))}
        </Text>
      );
    }

    const blockStyle: any = { marginVertical: 4 };

    if (tagName === 'h1') {
      blockStyle.fontSize = 24;
      blockStyle.fontWeight = 'bold';
      blockStyle.marginVertical = 8;
      blockStyle.color = '#FFFFFF';
    } else if (tagName === 'h2') {
      blockStyle.fontSize = 20;
      blockStyle.fontWeight = 'bold';
      blockStyle.marginVertical = 6;
      blockStyle.color = '#FFFFFF';
    } else if (tagName === 'h3') {
      blockStyle.fontSize = 18;
      blockStyle.fontWeight = 'bold';
      blockStyle.marginVertical = 6;
      blockStyle.color = '#FFFFFF';
    } else if (tagName === 'h4') {
      blockStyle.fontSize = 16;
      blockStyle.fontWeight = 'bold';
      blockStyle.color = '#FFFFFF';
    } else if (tagName === 'h5' || tagName === 'h6') {
      blockStyle.fontSize = 14;
      blockStyle.fontWeight = 'bold';
      blockStyle.color = '#FFFFFF';
    } else if (tagName === 'blockquote') {
      blockStyle.borderLeftWidth = 3;
      blockStyle.borderLeftColor = 'rgba(255, 255, 255, 0.3)';
      blockStyle.paddingLeft = 12;
      blockStyle.marginVertical = 8;
    } else if (tagName === 'pre') {
      blockStyle.backgroundColor = 'rgba(255, 255, 255, 0.05)';
      blockStyle.padding = 12;
      blockStyle.borderRadius = 8;
      blockStyle.marginVertical = 6;
    } else if (tagName === 'li') {
      blockStyle.flexDirection = 'row';
      blockStyle.alignItems = 'flex-start';
    }

    const allChildrenInline = node.children?.every(isInlineNode) ?? true;

    if (tagName === 'li') {
      const indexStr = node.attributes?.index ? `${node.attributes.index}. ` : '• ';

      return (
        <View key={index} style={[blockStyle, inlineStyles]} className="flex-row items-start pl-2">
          <Text style={[{ marginRight: 6, color: '#A0A0A0' }, combinedStyle]}>{indexStr}</Text>
          <View style={{ flex: 1 }}>
            {allChildrenInline ? (
              <Text style={combinedStyle}>
                {node.children?.map((child, idx) => renderNode(child, idx, combinedStyle))}
              </Text>
            ) : (
              node.children?.map((child, idx) => renderNode(child, idx, combinedStyle))
            )}
          </View>
        </View>
      );
    }

    if (tagName === 'br') {
      return <View key={index} style={{ height: 8 }} />;
    }

    if (tagName === 'ul' || tagName === 'ol') {
      const updatedChildren = node.children?.map((child, idx) => {
        if (child.name === 'li') {
          return {
            ...child,
            attributes: {
              ...child.attributes,
              ordered: tagName === 'ol' ? 'true' : 'false',
              index: tagName === 'ol' ? String(idx + 1) : '',
            },
          };
        }
        return child;
      });

      return (
        <View key={index} style={[blockStyle, inlineStyles]} className="pl-2">
          {updatedChildren?.map((child, idx) => renderNode(child, idx, combinedStyle))}
        </View>
      );
    }

    return (
      <View key={index} style={[blockStyle, inlineStyles]}>
        {allChildrenInline ? (
          <Text style={combinedStyle}>
            {node.children?.map((child, idx) => renderNode(child, idx, combinedStyle))}
          </Text>
        ) : (
          node.children?.map((child, idx) => renderNode(child, idx, combinedStyle))
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {nodes.map((node, index) => renderNode(node, index, { color: defaultTextColor, fontSize: 14, lineHeight: 22 }))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});
