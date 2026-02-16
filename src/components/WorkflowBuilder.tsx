import { useState, useRef, useEffect } from "react";
import {
  ChatSection,
  ChatInput,
  ChatMessage,
  ChatMessages,
  useChatUI,
  type Message,
  type ChatHandler,
  getParts,
} from "@llamaindex/chat-ui";
import "@llamaindex/chat-ui/styles/markdown.css";
import "@llamaindex/chat-ui/styles/editor.css";
import Markdown from "react-markdown";
import Editor from "@monaco-editor/react";
import { api, handleApiError } from "@/lib/api";
import { builderChat } from "@/lib/server/workflowBuilder";
import { useMonacoTheme } from "@/hooks/useMonacoTheme";
import { useMonacoTypes } from "@/hooks/useMonacoTypes";
 import { 
   AlertTriangle, 
   Loader2, 
   Check, 
  ArrowRight,
  Sparkles,
  Settings,
  Rocket,
  FileCheck,
  Zap,
  Workflow,
  Key,
  RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils"; 
import { showErrorNotification, showSuccessNotification } from "@/stores/notificationStore";
import { useNamespaceStore } from "@/stores/namespaceStore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Provider, WorkflowDeployment, WorkflowDeploymentsResponse } from "@/types/api";
import { ProviderConfigModal } from "@/components/ProviderConfigModal";
import { SecretConfigModal } from "@/components/SecretConfigModal";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface WorkflowBuilderProps {
  workflowId: string;
}

interface SecretInfo {
  id: string;
  name: string;
  provider?: string;
}

interface QuestionOption {
  id: string;
  label: string;
  description?: string;
}

// Extended types for plan support (extends server types)
interface MessagePart {
  type: string;
  text?: string;
  data?: {
    message?: string;
    question?: string;
    options?: QuestionOption[];
    provider_type?: string;
    provider?: string;
    code?: string;
    allow_multiple?: boolean;
    allowMultiple?: boolean;
    secret_name?: string;
    secretName?: string;
    description?: string;
    configured?: boolean;
    plan?: any;
    awaiting_approval?: boolean;
  };
}

interface BuilderChatResponse {
  message: {
    role: string;
    parts: MessagePart[];
  };
  code?: string;
  plan?: any;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function getMessageText(message: Message): string {
  const textParts = getParts(message, "text");
  const questionParts = getParts(message, "data-question");

  const texts = textParts.map((p) => p.text).filter(Boolean);
  const questions = questionParts
    .map((p: any) => p.data?.question)
    .filter(Boolean);

  return [...texts, ...questions].join("\n\n");
}

function shouldIncludeInHistory(message: Message): boolean {
  if (message.id === "welcome") return false;

  const content = getMessageText(message);
  if (!content || content.trim() === "") return false;

  if (!message.role || (message.role !== "user" && message.role !== "assistant")) {
    return false;
  }

  return true;
}

function processParts(parts: MessagePart[]): any[] {
  return parts.map((part) => {
    switch (part.type) {
      case "text":
        return { type: "text", text: part.text };
      case "data-question":
        return {
          type: "data-question",
          data: {
            question: part.data?.question,
            options: part.data?.options,
            allow_multiple: part.data?.allowMultiple ?? part.data?.allow_multiple,
          },
        };
      case "data-not-supported":
        return {
          type: "data-not-supported",
          data: { message: part.data?.message },
        };
      case "data-provider-setup": {
        const providerType = part.data?.provider_type || part.data?.provider;
        return {
          type: "data-provider-setup",
          data: {
            message: part.data?.message || `Configure ${providerType} to continue`,
            provider_type: providerType,
          },
        };
      }
      case "data-secret-setup":
        return {
          type: "data-secret-setup",
          data: {
            message: part.data?.description || part.data?.message,
            secret_name: part.data?.secretName || part.data?.secret_name,
            configured: part.data?.configured,
          },
        };
      case "data-code":
        return { type: "data-code", data: { code: part.data?.code } };
      case "data-plan-confirmation":
        return {
          type: "data-plan-confirmation",
          data: {
            plan: part.data?.plan,
            awaiting_approval: part.data?.awaiting_approval,
          },
        };
      default:
        return part;
    }
  });
}

const EXAMPLE_PROMPTS = [
  "Send a slack message in #deployments whenever a merge request gets merged on usefloww/floww-sdk",
  "Every morning at 9am, send a message with the tickets that got done the day before",
  "When a new issue is created in GitHub, create a corresponding task in Linear",
];

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: "👋 Welcome to the Workflow Builder! I'll help you create your workflow step by step.\n\nTry one of these examples, or describe your own automation:",
    },
    {
      type: "data-examples",
      data: {
        prompts: EXAMPLE_PROMPTS,
      },
    },
  ],
};

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

export function WorkflowBuilder({ workflowId }: WorkflowBuilderProps) {
  // Persist messages in sessionStorage to survive component remounts and page reloads
  const [messages, setMessagesState] = useState<Message[]>(() => {
    const stored = sessionStorage.getItem(`workflow-messages-${workflowId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const validMessages = parsed.filter((m: Message) => {
          if (m.id === "welcome") return true;
          return shouldIncludeInHistory(m);
        });
        if (validMessages.length === 0 || validMessages[0]?.id !== "welcome") {
          return [WELCOME_MESSAGE, ...validMessages.filter((m: Message) => m.id !== "welcome")];
        }
        return validMessages;
      } catch {
        return [WELCOME_MESSAGE];
      }
    }
    return [WELCOME_MESSAGE];
  });

  const setMessages = (newMessages: Message[]) => {
    setMessagesState(newMessages);
    sessionStorage.setItem(`workflow-messages-${workflowId}`, JSON.stringify(newMessages));
  };

  const [status, setStatus] = useState<"submitted" | "streaming" | "ready" | "error">("ready");

  // Persist plan in sessionStorage to survive component remounts
  const [plan, setPlanState] = useState<any>(() => {
    const stored = sessionStorage.getItem(`workflow-plan-${workflowId}`);
    return stored ? JSON.parse(stored) : null;
  });

  const setPlan = (newPlan: any) => {
    setPlanState(newPlan);
    if (newPlan) {
      sessionStorage.setItem(`workflow-plan-${workflowId}`, JSON.stringify(newPlan));
    } else {
      sessionStorage.removeItem(`workflow-plan-${workflowId}`);
    }
  };

  // Clear conversation helper
  const clearConversation = () => {
    setMessages([WELCOME_MESSAGE]);
    setPlan(null);
    sessionStorage.removeItem(`workflow-messages-${workflowId}`);
    sessionStorage.removeItem(`workflow-plan-${workflowId}`);
  };

  // Expose clear function globally for debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).clearWorkflowBuilder = () => {
        console.log('[WorkflowBuilder] Clearing all data...');
        // Clear all workflow-related sessionStorage
        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith('workflow-')) {
            sessionStorage.removeItem(key);
            console.log(`[WorkflowBuilder] Removed: ${key}`);
          }
        });
        // Reset state
        setMessages([WELCOME_MESSAGE]);
        setPlan(null);
        console.log('[WorkflowBuilder] Done! Reload the page to start fresh.');
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  // Debug plan state changes
  useEffect(() => {
    console.log("[WorkflowBuilder] Plan state changed:", plan?.summary || null);
  }, [plan]);

  const [code, setCode] = useState<string>(`// Your workflow code will appear here as we build it together
// Describe what you want and I'll help you build it!
`);
  const monacoTheme = useMonacoTheme();
  const { beforeMount: beforeMonacoMount, onMount: onMonacoMount } = useMonacoTypes();
  const formRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<any>(null);

  // Keep planRef in sync with plan state
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);
  const { currentNamespace } = useNamespaceStore();
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [selectedProviderType, setSelectedProviderType] = useState<string | undefined>(undefined);
  const [pendingProviderType, setPendingProviderType] = useState<string | undefined>(undefined);

  const [secretModalOpen, setSecretModalOpen] = useState(false);
  const [selectedSecretName, setSelectedSecretName] = useState<string | undefined>(undefined);
  const [selectedSecretDescription, setSelectedSecretDescription] = useState<string | undefined>(undefined);
  const [pendingSecretName, setPendingSecretName] = useState<string | undefined>(undefined);

  const queryClient = useQueryClient();

  // Fetch providers for the current namespace
  const { data: providersData } = useQuery<Provider[]>({
    queryKey: ['providers', currentNamespace?.id],
    queryFn: async () => {
      if (!currentNamespace?.id) return [];
      const params = { namespaceId: currentNamespace.id };
      const data = await api.get<{ results: Provider[] }>("/providers", { params });
      return Array.isArray(data?.results) ? data.results : [];
    },
    enabled: !!currentNamespace?.id,
  });

  const providers: Provider[] = providersData || [];

  // Fetch secrets for the current namespace
  const { data: secretsData } = useQuery<SecretInfo[]>({
    queryKey: ['secrets', currentNamespace?.id],
    queryFn: async () => {
      if (!currentNamespace?.id) return [];
      const data = await api.get<{ results: SecretInfo[] }>("/secrets", { params: { namespaceId: currentNamespace.id } });
      return Array.isArray(data?.results) ? data.results : [];
    },
    enabled: !!currentNamespace?.id,
  });

  const secretsList: SecretInfo[] = secretsData || [];

  // Auto-continue conversation after provider is configured
  useEffect(() => {
    if (!pendingProviderType) return;

    const providerConfigured = providers.some(
      p => p.type.toLowerCase() === pendingProviderType.toLowerCase()
    );

    if (providerConfigured && status === "ready") {
      setPendingProviderType(undefined);

      const continuationMsg: Message = {
        id: `provider-configured-${Date.now()}`,
        role: "user",
        parts: [{ type: "text", text: `I've configured ${pendingProviderType}. Please continue.` }],
      };

      sendMessage(continuationMsg);
    }
  }, [providers, pendingProviderType, status]);

  // Auto-continue conversation after secret is configured
  useEffect(() => {
    if (!pendingSecretName) return;

    const secretConfigured = secretsList.some(
      s => s.name === pendingSecretName
    );

    if (secretConfigured && status === "ready") {
      setPendingSecretName(undefined);

      const continuationMsg: Message = {
        id: `secret-configured-${Date.now()}`,
        role: "user",
        parts: [{ type: "text", text: `I've configured the secret "${pendingSecretName}". Please continue.` }],
      };

      sendMessage(continuationMsg);
    }
  }, [secretsList, pendingSecretName, status]);

  // Fetch existing deployments to get a runtime_id
  const { data: deploymentsData } = useQuery<WorkflowDeployment[]>({
    queryKey: ['deployments', workflowId],
    queryFn: async () => {
      const params = { workflowId: workflowId };
      const data = await api.get<WorkflowDeploymentsResponse>("/workflow-deployments", { params });
      return (data.deployments || []).sort(
        (a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime()
      );
    },
  });

  const existingDeployments = deploymentsData || [];
  const latestDeployment = existingDeployments[0];

  // Deploy mutation
  const deployMutation = useMutation({
    mutationFn: async () => {
      const deploymentData: Record<string, unknown> = {
        workflowId: workflowId,
        code: {
          files: { "main.ts": code },
          entrypoint: "main.ts",
        },
      };
      
      // Use existing runtime if available, otherwise backend will use default runtime
      if (latestDeployment?.runtimeId) {
        deploymentData.runtimeId = latestDeployment.runtimeId;
      }
      
      return api.post("/workflow-deployments", deploymentData);
    },
    onSuccess: () => {
      showSuccessNotification("Deployed!", "Your workflow has been deployed successfully.");
      queryClient.invalidateQueries({ queryKey: ['deployments', workflowId] });
    },
    onError: (error) => {
      showErrorNotification("Deploy failed", handleApiError(error));
    },
  });

  const canDeploy = code.includes("import") && code.length > 50;
  const isDeploying = deployMutation.isPending;

  async function sendMessage(msg: Message) {
    const userContent = getMessageText(msg);
    
    const newMessages = [...messages, msg];
    setMessages(newMessages);
    setStatus("submitted");

    try {
      const simpleMessages = messages
        .filter(shouldIncludeInHistory)
        .map((m) => ({
          role: m.role,
          content: getMessageText(m),
        }));

      const resp = (await builderChat({
        data: {
          workflowId,
          messages: simpleMessages,
          userMessage: userContent,
          currentCode: code,
          namespaceId: currentNamespace?.id,
          currentPlan: plan,
        },
      })) as BuilderChatResponse;

      console.log("[WorkflowBuilder] Received response:", {
        has_code: !!resp.code,
        has_plan: !!resp.plan,
        plan_summary: resp.plan?.summary,
      });

      const processedParts = processParts(resp.message.parts);

      const assistantMsg: Message = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        parts: processedParts,
      };

      setMessages([...newMessages, assistantMsg]);

      if (resp.code) {
        setCode(resp.code);
      }

      // Update plan if present in response OR extract from message parts
      if (resp.plan) {
        console.log("[WorkflowBuilder] Setting plan from response:", resp.plan);
        setPlan(resp.plan);
      } else {
        // Check if there's a plan in the message parts
        const planPart = resp.message.parts.find(p => p.type === "data-plan-confirmation");
        if (planPart?.data?.plan) {
          console.log("[WorkflowBuilder] Setting plan from message parts:", planPart.data.plan);
          setPlan(planPart.data.plan);
        }
      }

      // Clear plan if code was generated (approval completed)
      if (resp.code && resp.code !== code) {
        console.log("[WorkflowBuilder] Code generated, clearing plan");
        setPlan(null);
      }

      setStatus("ready");
    } catch (error) {
      setStatus("error");
      const errorMessage = handleApiError(error);
      showErrorNotification("Chat error", errorMessage);
      console.error("Error sending message:", error);
    }
  }

  // Handle clicking an example prompt
  const handleExampleClick = (prompt: string) => {
    const exampleMessage: Message = {
      id: `example-${Date.now()}`,
      role: "user",
      parts: [{ type: "text", text: prompt }],
    };
    sendMessage(exampleMessage);
  };

  // Handle confirming a selection (Single or Multi)
  const handleSelectionConfirm = async (selectedOptions: QuestionOption[], answerText?: string) => {
    // Use provided answerText if available, otherwise convert options to string
    const labelString = answerText || selectedOptions.map(o => o.label).join(", ");

    console.log("[WorkflowBuilder] handleSelectionConfirm called:", {
      answerText,
      labelString,
      current_plan: plan?.summary,
    });

    // Create user message with the answer
    const userMsg: Message = {
      id: `answer-${Date.now()}`,
      role: "user",
      parts: [{ type: "text", text: labelString }],
    };

    // Add user message to conversation
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setStatus("submitted");

    try {
      // Send conversation history WITHOUT current message (sent separately as user_message)
      const simpleMessages = messages
        .filter(shouldIncludeInHistory)
        .map((m) => ({
          role: m.role,
          content: getMessageText(m),
        }));

      const resp = (await builderChat({
        data: {
          workflowId,
          messages: simpleMessages,
          userMessage: labelString,
          currentCode: code,
          namespaceId: currentNamespace?.id,
          currentPlan: plan,
        },
      })) as BuilderChatResponse;

      const processedParts = processParts(resp.message.parts);

      const assistantMsg: Message = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        parts: processedParts,
      };

      setMessages([...newMessages, assistantMsg]);

      if (resp.code) {
        setCode(resp.code);
      }

      // Update plan if present in response OR extract from message parts
      if (resp.plan) {
        console.log("[WorkflowBuilder] Setting plan from response:", resp.plan);
        setPlan(resp.plan);
      } else {
        // Check if there's a plan in the message parts
        const planPart = resp.message.parts.find(p => p.type === "data-plan-confirmation");
        if (planPart?.data?.plan) {
          console.log("[WorkflowBuilder] Setting plan from message parts:", planPart.data.plan);
          setPlan(planPart.data.plan);
        }
      }

      // Clear plan if code was generated (approval completed)
      if (resp.code && resp.code !== code) {
        console.log("[WorkflowBuilder] Code generated, clearing plan");
        setPlan(null);
      }

      setStatus("ready");
    } catch (error) {
      setStatus("error");
      const errorMessage = handleApiError(error);
      showErrorNotification("Chat error", errorMessage);
      console.error("Error sending message:", error);
    }
  };

  const handler: ChatHandler = {
    messages,
    status,
    sendMessage,
  };

  // Control textarea height to prevent unnecessary growth
  useEffect(() => {
    const container = formRef.current;
    if (!container) return;

    const findTextarea = () => {
      return container.querySelector("textarea") as HTMLTextAreaElement | null;
    };

    let singleLineHeight = 0;
    let rafId: number | null = null;

    const measureSingleLineHeight = (textarea: HTMLTextAreaElement): number => {
      // Temporarily set to single line to measure
      const originalValue = textarea.value;
      const originalHeight = textarea.style.height;
      const originalOverflow = textarea.style.overflow;
      
      // Use a character that represents typical text height
      textarea.value = "M";
      textarea.style.height = "auto";
      textarea.style.overflow = "hidden";
      textarea.style.paddingTop = "";
      textarea.style.paddingBottom = "";
      
      // Force a reflow to get accurate measurement
      void textarea.offsetHeight;
      
      const measuredHeight = textarea.scrollHeight;
      
      // Restore original state
      textarea.value = originalValue;
      textarea.style.height = originalHeight;
      textarea.style.overflow = originalOverflow;
      
      return measuredHeight;
    };

    const adjustHeight = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      
      rafId = requestAnimationFrame(() => {
        const textarea = findTextarea();
        if (!textarea) return;

        // Measure single line height on first run
        if (singleLineHeight === 0) {
          singleLineHeight = measureSingleLineHeight(textarea);
        }

        // Get current value length to detect if it's truly wrapping
        const value = textarea.value;
        const hasNewlines = value.includes("\n");
        
        // Reset height to get accurate scrollHeight
        textarea.style.height = "auto";
        textarea.style.overflow = "hidden";
        const scrollHeight = textarea.scrollHeight;
        
        // Only grow if:
        // 1. Content has newlines (explicit wrapping), OR
        // 2. scrollHeight is significantly larger than single line (actual wrapping)
        // Use a larger threshold (5px) to prevent minor fluctuations
        if (hasNewlines || scrollHeight > singleLineHeight + 5) {
          textarea.style.setProperty("height", `${Math.min(scrollHeight, 128)}px`, "important"); // max-h-32 = 128px
          textarea.style.setProperty("overflow-y", "auto", "important");
        } else {
          // Force single line height with important to override library styles
          // Ensure padding is preserved for proper text alignment
          textarea.style.setProperty("height", `${singleLineHeight}px`, "important");
          textarea.style.setProperty("overflow", "hidden", "important");
          textarea.style.setProperty("padding-top", "", "important");
          textarea.style.setProperty("padding-bottom", "", "important");
        }
      });
    };

    // Use MutationObserver to detect when textarea is added to DOM
    const observer = new MutationObserver(() => {
      const textarea = findTextarea();
      if (textarea && !textarea.dataset.heightControlled) {
        textarea.dataset.heightControlled = "true";
        // Measure single line height
        singleLineHeight = measureSingleLineHeight(textarea);
        // Set initial height with important to override library
        textarea.style.setProperty("height", `${singleLineHeight}px`, "important");
        textarea.style.setProperty("overflow", "hidden", "important");
        // Add event listeners
        textarea.addEventListener("input", adjustHeight);
      }
    });

    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    
    // Initial check with a delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      const textarea = findTextarea();
      if (textarea && !textarea.dataset.heightControlled) {
        textarea.dataset.heightControlled = "true";
        singleLineHeight = measureSingleLineHeight(textarea);
        textarea.style.setProperty("height", `${singleLineHeight}px`, "important");
        textarea.style.setProperty("overflow", "hidden", "important");
        textarea.addEventListener("input", adjustHeight);
      }
    }, 150);

    // Monitor for library overrides - check computed height, not just inline style
    const checkInterval = setInterval(() => {
      const textarea = findTextarea();
      if (textarea && textarea.dataset.heightControlled && singleLineHeight > 0) {
        const computedHeight = textarea.offsetHeight;
        const value = textarea.value;
        const hasNewlines = value.includes("\n");
        
        // If height was changed but shouldn't be, reset it
        if (!hasNewlines && computedHeight > singleLineHeight + 5) {
          // Check if content actually wraps
          textarea.style.height = "auto";
          textarea.style.overflow = "hidden";
          const scrollHeight = textarea.scrollHeight;
          if (scrollHeight <= singleLineHeight + 5) {
            // Force single line - use setProperty with important to override library
            textarea.style.setProperty("height", `${singleLineHeight}px`, "important");
            textarea.style.setProperty("overflow", "hidden", "important");
          } else {
            textarea.style.setProperty("height", `${Math.min(scrollHeight, 128)}px`, "important");
            textarea.style.setProperty("overflow-y", "auto", "important");
          }
        }
      }
    }, 50); // Check more frequently

    return () => {
      clearTimeout(timeoutId);
      clearInterval(checkInterval);
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      observer.disconnect();
      const textarea = findTextarea();
      if (textarea) {
        textarea.removeEventListener("input", adjustHeight);
      }
    };
  }, []);

  return (
    <div className="flex h-[calc(100vh-280px)] gap-6 p-1">
      {/* Left Column: Code Preview */}
      <div className="w-1/2 flex flex-col border border-border rounded-xl overflow-hidden bg-card shadow-sm transition-all duration-200 hover:shadow-md">
        <div className="border-b border-border px-4 py-3 bg-muted/30 flex items-center justify-between backdrop-blur-sm">
            <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-sm font-semibold text-foreground">main.ts</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-0.5 bg-background rounded-full border">Generated</span>
            </div>
            <Button
              size="sm"
              onClick={() => deployMutation.mutate()}
              disabled={!canDeploy || isDeploying}
              className={cn(
                "gap-2 transition-all",
                canDeploy ? "bg-green-600 hover:bg-green-700 text-white" : ""
              )}
            >
              {isDeploying ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="h-3.5 w-3.5" />
                  Deploy
                </>
              )}
            </Button>
        </div>
        <div className="flex-1 relative">
            <Editor
            height="100%"
            defaultLanguage="typescript"
            value={code}
            onChange={(value) => setCode(value || "")}
            theme={monacoTheme}
            beforeMount={beforeMonacoMount}
            onMount={onMonacoMount}
            options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineHeight: 22,
                padding: { top: 16 },
                fontFamily: "'JetBrains Mono', monospace",
                scrollBeyondLastLine: false,
                smoothScrolling: true,
            }}
            />
        </div>
      </div>

      {/* Right Column: Unified Chat Interface */}
      <div className="w-1/2 flex flex-col">
        {/* Unified container for history + input */}
        <div className="flex-1 border border-border rounded-2xl bg-background shadow-sm overflow-hidden flex flex-col relative transition-all">

          {/* Chat header with clear button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 shrink-0">
            <div className="text-sm font-semibold text-foreground">Workflow Chat</div>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearConversation}
              className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>

          <ChatSection handler={handler} className="flex-1 flex flex-col min-h-0">
            
            {/* Messages Area - flex-1 allows it to fill space and scroll */}
            <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
                <CustomChatMessages
                    status={status}
                    onConfirm={handleSelectionConfirm}
                    providers={providers}
                    onOpenProviderModal={(providerType) => {
                      setSelectedProviderType(providerType);
                      setPendingProviderType(providerType);
                      setProviderModalOpen(true);
                    }}
                    secrets={secretsList}
                    onOpenSecretModal={(secretName, description) => {
                      setSelectedSecretName(secretName);
                      setSelectedSecretDescription(description);
                      setPendingSecretName(secretName);
                      setSecretModalOpen(true);
                    }}
                    onExampleClick={handleExampleClick}
                />
                {/* Invisible element to auto-scroll to bottom if needed */}
                <div className="h-4" /> 
            </div>

            {/* Input Area - Integrated visually at the bottom */}
<div className="p-4 bg-background mt-auto z-10" ref={formRef}>
              <ChatInput className="relative">
                <ChatInput.Form 
                  className="
                    relative flex items-center gap-2 
                    bg-background 
                    border border-input 
                    rounded-xl px-3 py-3 
                    shadow-sm 
                    transition-all duration-200 ease-in-out
                    focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary
                  "
                >
                  
                  {/* Icon Area */}
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/50 text-muted-foreground shrink-0">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  
                  {/* The actual input */}
                  {/* resize-none prevents manual dragging. Height controlled via useEffect */}
                  <ChatInput.Field 
                    placeholder="Type a message or click an example above..." 
                    className="
                      flex-1 
                      bg-transparent 
                      min-h-[24px]
                      max-h-32 
                      border-none 
                      shadow-none 
                      outline-none 
                      focus-visible:ring-0 
                      focus-visible:ring-offset-0 
                      p-0 py-1
                      text-sm 
                      placeholder:text-muted-foreground/60 
                      resize-none
                      leading-normal
                      overflow-y-auto
                    " 
                  />
                  
                  {/* Submit Button */}
                  <ChatInput.Submit 
                    className="
                      shrink-0 
                      p-2 h-8 w-8 
                      rounded-lg 
                      bg-primary text-primary-foreground 
                      hover:bg-primary/90 
                      disabled:opacity-50 disabled:cursor-not-allowed
                      flex items-center justify-center 
                      transition-all
                    " 
                  />
                </ChatInput.Form>
              </ChatInput>
              
              <div className="text-[10px] text-center text-muted-foreground mt-3 opacity-60">
                AI can make mistakes. Review generated workflows.
              </div>
            </div>
          </ChatSection>
          
        </div>
      </div>
      
      {/* Provider Configuration Modal */}
      {currentNamespace && (
        <ProviderConfigModal
          open={providerModalOpen}
          onOpenChange={(open) => {
            setProviderModalOpen(open);
            if (!open) {
              setSelectedProviderType(undefined);
              setTimeout(() => {
                setPendingProviderType(prev => {
                  const configured = providers.some(
                    p => prev && p.type.toLowerCase() === prev.toLowerCase()
                  );
                  return configured ? prev : undefined;
                });
              }, 1000);
            }
          }}
          namespaceId={currentNamespace.id}
          providerType={selectedProviderType}
        />
      )}

      {/* Secret Configuration Modal */}
      {currentNamespace && selectedSecretName && (
        <SecretConfigModal
          open={secretModalOpen}
          onOpenChange={(open) => {
            setSecretModalOpen(open);
            if (!open) {
              setSelectedSecretName(undefined);
              setSelectedSecretDescription(undefined);
              setTimeout(() => {
                setPendingSecretName(prev => {
                  const configured = secretsList.some(
                    s => prev && s.name === prev
                  );
                  return configured ? prev : undefined;
                });
              }, 1000);
            }
          }}
          namespaceId={currentNamespace.id}
          secretName={selectedSecretName}
          secretDescription={selectedSecretDescription}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Custom Chat Message List
// ------------------------------------------------------------------

interface CustomChatMessagesProps {
  status: "submitted" | "streaming" | "ready" | "error";
  onConfirm: (options: QuestionOption[], answerText?: string) => void;
  providers: Provider[];
  onOpenProviderModal: (providerType: string) => void;
  secrets: SecretInfo[];
  onOpenSecretModal: (secretName: string, description?: string) => void;
  onExampleClick: (prompt: string) => void;
}

function CustomChatMessages({ status, onConfirm, providers, onOpenProviderModal, secrets, onOpenSecretModal, onExampleClick }: CustomChatMessagesProps) {
  const { messages } = useChatUI();
  const isLoading = status === "submitted" || status === "streaming";
  const bottomRef = useRef<HTMLDivElement>(null);
  const [focusedExampleIndex, setFocusedExampleIndex] = useState<number | null>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
    // Reset focus when messages change
    setFocusedExampleIndex(null);
  }, [messages.length, status]);

  return (
    <ChatMessages className="h-full px-4 pt-6 pb-2 space-y-8">
      <ChatMessages.List>
        {messages.map((message, index) => {
          const isLast = index === messages.length - 1;
          const isAssistant = message.role === "assistant";
          const isInteractionActive = isLast && !isLoading;
          
          // Extract parts
          const questionParts = getParts(message, "data-question");
          const exampleParts = getParts(message, "data-examples");
          const notSupportedParts = getParts(message, "data-not-supported");
          const providerSetupParts = getParts(message, "data-provider-setup");
          const secretSetupParts = getParts(message, "data-secret-setup");
          const codeParts = getParts(message, "data-code");
          const planConfirmationParts = getParts(message, "data-plan-confirmation");

          return (
            <div key={message.id || index} className="group animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-backwards">
              <ChatMessage
                message={message}
                isLast={isLast}
                className={cn(
                    "items-start gap-4 max-w-full",
                    isAssistant ? "" : "flex-row-reverse"
                )}
              >
                {/* Avatar */}
                <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center border shadow-sm shrink-0 mt-1",
                    isAssistant ? "bg-background border-border" : "bg-primary text-primary-foreground border-primary"
                )}>
                    {isAssistant ? <Sparkles className="h-4 w-4 text-primary" /> : <div className="text-xs font-bold">You</div>}
                </div>

                <div className={cn("flex-1 space-y-2 min-w-0", isAssistant ? "" : "flex flex-col items-end")}>
                    
                    {/* Text Content */}
                    {getMessageText(message) && (
                      <div className={cn(
                          "prose prose-sm dark:prose-invert max-w-none break-words",
                          isAssistant ? "text-foreground" : "bg-primary text-primary-foreground px-4 py-2.5 rounded-2xl rounded-tr-sm"
                      )}>
                          <Markdown>{getMessageText(message)}</Markdown>
                      </div>
                    )}

                    {/* --- Interactive Elements (Only for Assistant) --- */}
                    
                    {/* 1. Example Prompts */}
                    {isAssistant && exampleParts.length > 0 && (
                        <div className="mt-4 w-full max-w-2xl">
                            {exampleParts.map((part: any, partIndex) => (
                                <div key={partIndex} className="grid grid-cols-1 gap-2.5">
                                    {(part.data?.prompts || []).map((prompt: string, promptIndex: number) => {
                                        const isFocused = focusedExampleIndex === promptIndex;
                                        return (
                                            <button
                                                key={promptIndex}
                                                onClick={() => {
                                                    if (isInteractionActive) {
                                                        onExampleClick(prompt);
                                                        setFocusedExampleIndex(null);
                                                    }
                                                }}
                                                onMouseEnter={() => {
                                                    if (isInteractionActive) {
                                                        setFocusedExampleIndex(promptIndex);
                                                    }
                                                }}
                                                onMouseLeave={() => {
                                                    if (isInteractionActive) {
                                                        setFocusedExampleIndex(null);
                                                    }
                                                }}
                                                onFocus={() => {
                                                    if (isInteractionActive) {
                                                        setFocusedExampleIndex(promptIndex);
                                                    }
                                                }}
                                                onBlur={() => {
                                                    if (isInteractionActive) {
                                                        setFocusedExampleIndex(null);
                                                    }
                                                }}
                                                disabled={!isInteractionActive}
                                                className={cn(
                                                    "group relative text-left rounded-xl border p-4 transition-all duration-200",
                                                    isInteractionActive
                                                        ? "cursor-pointer border-border bg-card"
                                                        : "opacity-60 pointer-events-none grayscale-[0.5]",
                                                    isFocused && isInteractionActive
                                                        ? "border-primary/60 bg-muted/50"
                                                        : isInteractionActive
                                                        ? "hover:border-primary/40 hover:bg-muted/40 hover:shadow-sm"
                                                        : "",
                                                    "hover:scale-[1.01] active:scale-[0.99]"
                                                )}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className={cn(
                                                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                                                        isFocused && isInteractionActive
                                                            ? "border-primary/50 bg-primary/10"
                                                            : "border-muted-foreground/30 bg-background group-hover:border-primary/50"
                                                    )}>
                                                        <ArrowRight className={cn(
                                                            "h-3 w-3 transition-colors",
                                                            isFocused && isInteractionActive
                                                                ? "text-primary"
                                                                : "text-muted-foreground group-hover:text-primary"
                                                        )} />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-sm font-medium text-foreground">
                                                            {prompt}
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 2. Questions / Options */}
                    {isAssistant && questionParts.length > 0 && (
                        <MultiQuestionContainer
                            questions={questionParts as Array<{ data?: QuestionData }>}
                            isActive={isInteractionActive}
                            onConfirm={onConfirm}
                        />
                    )}

                    {/* 3. Plan Confirmation */}
                    {isAssistant && planConfirmationParts.length > 0 && (
                        <div className="mt-3 w-full max-w-2xl">
                        {planConfirmationParts.map((part: any, partIndex) => {
                            const plan = part.data?.plan;

                            if (!plan) {
                                return (
                                    <div key={partIndex} className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
                                        <p className="text-sm text-amber-800 dark:text-amber-200">
                                            Plan data is missing or malformed. Please try again.
                                        </p>
                                        <pre className="text-xs mt-2 overflow-auto">{JSON.stringify(part, null, 2)}</pre>
                                    </div>
                                );
                            }

                            return (
                            <div
                                key={partIndex}
                                className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-2 border-emerald-200 dark:border-emerald-800 rounded-xl p-5 shadow-sm"
                            >
                                {/* Header */}
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                                        <FileCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-base font-semibold text-emerald-900 dark:text-emerald-100 mb-1">
                                            Workflow Plan
                                        </h4>
                                        <p className="text-sm text-emerald-700 dark:text-emerald-300">
                                            {plan?.summary || plan?.description || "Workflow automation"}
                                        </p>
                                    </div>
                                </div>

                                {/* Trigger Section */}
                                {plan?.trigger && (
                                    <div className="mb-4 pb-4 border-b border-emerald-200 dark:border-emerald-800/50">
                                        <div className="flex items-start gap-2 mb-2">
                                            <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1">
                                                <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 uppercase tracking-wide mb-1">
                                                    Trigger
                                                </div>
                                                {typeof plan.trigger === 'string' ? (
                                                    <p className="text-sm text-emerald-800 dark:text-emerald-200">
                                                        {plan.trigger}
                                                    </p>
                                                ) : (
                                                    <>
                                                        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                                                            {plan.trigger.type || 'Event'}
                                                            {plan.trigger.source && (
                                                                <span className="text-emerald-600 dark:text-emerald-400 ml-1">
                                                                    from {plan.trigger.source}
                                                                </span>
                                                            )}
                                                        </p>
                                                        {plan.trigger.details && (
                                                            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                                                                {plan.trigger.details}
                                                            </p>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Actions Section */}
                                {plan?.actions && plan.actions.length > 0 && (
                                    <div className="mb-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Workflow className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                            <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 uppercase tracking-wide">
                                                Actions
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            {plan.actions.map((action: any, idx: number) => {
                                                const actionDesc = typeof action === 'string'
                                                    ? action
                                                    : (action.description || action.action || String(action));
                                                const provider = typeof action === 'object' ? action.provider : null;

                                                return (
                                                    <div
                                                        key={idx}
                                                        className="flex items-start gap-3 bg-white/50 dark:bg-black/20 rounded-lg p-3 border border-emerald-100 dark:border-emerald-900/50"
                                                    >
                                                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex-shrink-0">
                                                            {idx + 1}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            {provider && (
                                                                <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded text-xs font-medium mb-1">
                                                                    {provider}
                                                                </div>
                                                            )}
                                                            <p className="text-sm text-emerald-900 dark:text-emerald-100">
                                                                {actionDesc}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Required Providers/Secrets */}
                                {(plan?.requiredProviders?.length > 0 || plan?.requiredSecrets?.length > 0) && (
                                    <div className="flex flex-wrap gap-4 pt-3 border-t border-emerald-200 dark:border-emerald-800/50">
                                        {plan.requiredProviders?.length > 0 && (
                                            <div className="flex items-center gap-2">
                                                <Settings className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                                <span className="text-xs text-emerald-700 dark:text-emerald-300">
                                                    <span className="font-medium">Providers:</span> {plan.requiredProviders.join(', ')}
                                                </span>
                                            </div>
                                        )}
                                        {plan.requiredSecrets?.length > 0 && (
                                            <div className="flex items-center gap-2">
                                                <Key className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                                <span className="text-xs text-emerald-700 dark:text-emerald-300">
                                                    <span className="font-medium">Secrets:</span> {plan.requiredSecrets.join(', ')}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Approval Actions */}
                                {part.data?.awaiting_approval && isInteractionActive && (
                                    <div className="mt-5 pt-5 border-t border-emerald-200 dark:border-emerald-800/50">
                                        <div className="flex items-center gap-3">
                                            <Button
                                                onClick={() => onConfirm([], "Yes, generate this workflow")}
                                                disabled={isLoading}
                                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 rounded-lg transition-all shadow-sm hover:shadow-md disabled:opacity-50"
                                            >
                                                <Check className="h-4 w-4 mr-2" />
                                                Approve & Generate Code
                                            </Button>
                                            <Button
                                                onClick={() => {
                                                    const textarea = document.querySelector('textarea[placeholder*="Message"]') as HTMLTextAreaElement;
                                                    if (textarea) {
                                                        textarea.focus();
                                                    }
                                                }}
                                                disabled={isLoading}
                                                variant="outline"
                                                className="px-4 py-3 border-2 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg transition-all disabled:opacity-50"
                                            >
                                                Request Changes
                                            </Button>
                                        </div>
                                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-3 text-center">
                                            Review the plan above, then approve to generate the workflow code
                                        </p>
                                    </div>
                                )}
                            </div>
                            );
                        })}
                        </div>
                    )}

                    {/* 4. Provider Setup Prompts */}
                    {isAssistant && providerSetupParts.length > 0 && (
                        <div className="mt-2 w-full max-w-md">
                        {providerSetupParts.map((part: any, partIndex) => {
                            const providerType = part.data?.provider_type;
                            const existingProvider = providers.find(p => p.type.toLowerCase() === providerType?.toLowerCase());
                            
                            return (
                            <div
                                key={partIndex}
                                className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 rounded-xl p-4 transition-all hover:border-blue-300"
                            >
                                <p className="text-sm text-blue-800 dark:text-blue-200 mb-3 font-medium">
                                    {part.data?.message}
                                </p>
                                {existingProvider ? (
                                    <div className="inline-flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-blue-800 dark:text-blue-200 bg-blue-100 dark:bg-blue-900/40 rounded-lg gap-2">
                                        <Check className="h-4 w-4" />
                                        Using: {existingProvider.alias || existingProvider.name || providerType}
                                    </div>
                                ) : (
                                    <Button
                                        onClick={() => onOpenProviderModal(providerType)}
                                        className="inline-flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors gap-2"
                                    >
                                        <Settings className="h-4 w-4" />
                                        Configure {providerType}
                                    </Button>
                                )}
                            </div>
                            );
                        })}
                        </div>
                    )}

                    {/* 5. Secret Setup Prompts */}
                    {isAssistant && secretSetupParts.length > 0 && (
                        <div className="mt-2 w-full max-w-md">
                        {secretSetupParts.map((part: any, partIndex) => {
                            const secretName = part.data?.secret_name;
                            const existingSecret = secrets.find(s => s.name === secretName);

                            return (
                            <div
                                key={partIndex}
                                className="bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900 rounded-xl p-4 transition-all hover:border-purple-300"
                            >
                                <p className="text-sm text-purple-800 dark:text-purple-200 mb-3 font-medium">
                                    {part.data?.message}
                                </p>
                                {existingSecret ? (
                                    <div className="inline-flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-purple-800 dark:text-purple-200 bg-purple-100 dark:bg-purple-900/40 rounded-lg gap-2">
                                        <Check className="h-4 w-4" />
                                        Configured: {secretName}
                                    </div>
                                ) : (
                                    <Button
                                        onClick={() => onOpenSecretModal(secretName, part.data?.message)}
                                        className="inline-flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors gap-2"
                                    >
                                        <Key className="h-4 w-4" />
                                        Configure {secretName}
                                    </Button>
                                )}
                            </div>
                            );
                        })}
                        </div>
                    )}

                    {/* 6. Warnings */}
                    {isAssistant && notSupportedParts.length > 0 && (
                        <div className="mt-2 w-full max-w-md">
                        {notSupportedParts.map((part: any, partIndex) => (
                            <div
                            key={partIndex}
                            className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-3 flex items-start gap-3"
                            >
                            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                            <span className="text-sm text-amber-800 dark:text-amber-200">
                                {part.data?.message}
                            </span>
                            </div>
                        ))}
                        </div>
                    )}

                    {/* 7. Code Snippets (if sent in message) */}
                    {isAssistant && codeParts.length > 0 && (
                        <div className="mt-2 w-full max-w-lg">
                        {codeParts.map((part: any, partIndex) => (
                            <div key={partIndex} className="bg-muted/50 border rounded-lg p-3 overflow-x-auto">
                            <pre className="text-xs font-mono text-foreground">
                                <code>{part.data?.code}</code>
                            </pre>
                            </div>
                        ))}
                        </div>
                    )}
                </div>
              </ChatMessage>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-start gap-4 animate-in fade-in duration-300 pl-1">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 border border-transparent">
              <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
            </div>
            <div className="bg-muted/30 border border-border/50 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Thinking</span>
                <div className="flex gap-1">
                  <span className="w-1 h-1 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                  <span className="w-1 h-1 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                  <span className="w-1 h-1 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </ChatMessages.List>
    </ChatMessages>
  );
}

// ------------------------------------------------------------------
// Multi-Question Container (Handles multiple questions with single Continue)
// ------------------------------------------------------------------

interface QuestionData {
    question?: string;
    options?: QuestionOption[];
    allow_multiple?: boolean;
}

interface MultiQuestionContainerProps {
    questions: Array<{ data?: QuestionData }>;
    isActive: boolean;
    onConfirm: (options: QuestionOption[], answerText?: string) => void;
}

function MultiQuestionContainer({ questions, isActive, onConfirm }: MultiQuestionContainerProps) {
    // Track selections for each question by index
    const [selections, setSelections] = useState<Record<number, Set<string>>>({});
    // Track custom text input for each question
    const [customInputs, setCustomInputs] = useState<Record<number, string>>({});

    // Detect if a question should be text-input-only (no option buttons needed)
    const isTextInputOnly = (questionData?: QuestionData): boolean => {
        const options = questionData?.options || [];

        // If only 1 option and it contains hints about specifying custom input
        if (options.length === 1) {
            const option = options[0];
            const text = `${option.label} ${option.description || ""}`.toLowerCase();
            const textInputIndicators = [
                "specify in response",
                "type your own",
                "enter",
                "provide",
                "custom",
                "(specify",
                "your own"
            ];
            return textInputIndicators.some(indicator => text.includes(indicator));
        }

        return false;
    };

    const toggleOption = (questionIndex: number, optionId: string, allowMultiple: boolean) => {
        if (!isActive) return;

        setSelections(prev => {
            const currentSet = prev[questionIndex] || new Set<string>();
            const newSet = new Set(allowMultiple ? currentSet : []);

            if (newSet.has(optionId)) {
                newSet.delete(optionId);
            } else {
                if (!allowMultiple) newSet.clear();
                newSet.add(optionId);
            }

            return { ...prev, [questionIndex]: newSet };
        });
    };

    const handleCustomInputChange = (questionIndex: number, value: string) => {
        setCustomInputs(prev => ({
            ...prev,
            [questionIndex]: value
        }));
    };

    // Check if all questions have at least one selection OR custom input
    const allQuestionsAnswered = questions.every((part, index) => {
        const questionData = part.data;
        const textOnly = isTextInputOnly(questionData);

        if (textOnly) {
            // For text-input-only questions, custom input is required
            return customInputs[index]?.trim().length > 0;
        } else {
            // For regular questions, either selection or custom input works
            const selected = selections[index];
            const hasSelection = selected && selected.size > 0;
            const hasCustomInput = customInputs[index]?.trim().length > 0;
            return hasSelection || hasCustomInput;
        }
    });

    // Build combined answer text
    const handleConfirm = () => {
        const answers: string[] = [];
        const allSelectedOptions: QuestionOption[] = [];

        questions.forEach((part, index) => {
            const customInput = customInputs[index]?.trim();

            // Prefer custom input if provided
            if (customInput) {
                if (part.data?.question) {
                    answers.push(`${part.data.question}: ${customInput}`);
                } else {
                    answers.push(customInput);
                }
            } else {
                // Fall back to selected options
                const selectedIds = selections[index] || new Set<string>();
                const options = part.data?.options || [];
                const selectedOptions = options.filter(o => selectedIds.has(o.id));

                allSelectedOptions.push(...selectedOptions);

                if (selectedOptions.length > 0) {
                    const answerLabels = selectedOptions.map(o => o.label).join(", ");
                    if (part.data?.question) {
                        answers.push(`${part.data.question}: ${answerLabels}`);
                    } else {
                        answers.push(answerLabels);
                    }
                }
            }
        });

        const combinedAnswerText = answers.join("\n\n");
        onConfirm(allSelectedOptions, combinedAnswerText);
    };

    return (
        <div className="mt-4 w-full max-w-md space-y-6">
            {questions.map((part, questionIndex) => {
                const questionData = part.data;
                const options = questionData?.options || [];
                const allowMultiple = questionData?.allow_multiple ?? false;
                const selectedIds = selections[questionIndex] || new Set<string>();
                const textOnly = isTextInputOnly(questionData);

                // Extract placeholder and description for text-input-only mode
                const textOnlyPlaceholder = textOnly && options[0]?.description
                    ? options[0].description
                    : "Type your answer...";

                return (
                    <div key={questionIndex} className="space-y-2">
                        {questionData?.question && (
                            <div className="text-sm font-medium text-foreground">
                                {questionData.question}
                            </div>
                        )}

                        {/* Show option buttons only if NOT text-input-only */}
                        {!textOnly && (
                            <div className="grid grid-cols-1 gap-2">
                                {options.map((option) => {
                                    const isSelected = selectedIds.has(option.id);
                                    return (
                                        <div
                                            key={option.id}
                                            onClick={() => toggleOption(questionIndex, option.id, allowMultiple)}
                                            className={cn(
                                                "group relative flex items-start gap-3 rounded-xl border p-3 text-left transition-all duration-200",
                                                isActive
                                                    ? "cursor-pointer hover:border-primary/40 hover:bg-muted/40"
                                                    : "opacity-60 pointer-events-none grayscale-[0.5]",
                                                isSelected
                                                    ? "border-primary bg-primary/5"
                                                    : "border-border bg-card"
                                            )}
                                        >
                                            <div className={cn(
                                                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all duration-200",
                                                isSelected
                                                    ? "border-primary bg-primary text-primary-foreground"
                                                    : "border-muted-foreground/30 bg-background group-hover:border-primary/50",
                                                !allowMultiple && "rounded-full"
                                            )}>
                                                <Check className={cn(
                                                    "h-3.5 w-3.5 transition-transform duration-200",
                                                    isSelected ? "scale-100" : "scale-0"
                                                )} />
                                            </div>

                                            <div className="flex-1 space-y-0.5">
                                                <div className={cn("text-sm font-medium transition-colors", isSelected ? "text-primary" : "text-foreground")}>
                                                    {option.label}
                                                </div>
                                                {option.description && (
                                                    <div className="text-xs text-muted-foreground leading-relaxed">
                                                        {option.description}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Custom text input */}
                        <div className="space-y-2">
                            {!textOnly && (
                                <div className="text-xs text-muted-foreground pl-1">
                                    {allowMultiple ? "Select all that apply" : "Select one option"}, or provide your own:
                                </div>
                            )}
                            <input
                                type="text"
                                value={customInputs[questionIndex] || ""}
                                onChange={(e) => handleCustomInputChange(questionIndex, e.target.value)}
                                placeholder={textOnly ? textOnlyPlaceholder : "Or type your own answer..."}
                                disabled={!isActive}
                                className={cn(
                                    "w-full px-3 py-2 text-sm rounded-lg border transition-all",
                                    "bg-background text-foreground placeholder:text-muted-foreground/60",
                                    "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                                    !isActive && "opacity-60 cursor-not-allowed"
                                )}
                            />
                        </div>
                    </div>
                );
            })}

            {/* Single Continue button for all questions */}
            {isActive && (
                <div className="flex items-center justify-end gap-2 pt-2 animate-in slide-in-from-top-1 fade-in duration-300">
                    <Button 
                        size="sm" 
                        onClick={handleConfirm}
                        disabled={!allQuestionsAnswered}
                        className={cn(
                            "gap-2 transition-all duration-300 rounded-lg px-4",
                            allQuestionsAnswered 
                                ? "opacity-100 translate-x-0" 
                                : "opacity-50 translate-x-2 grayscale"
                        )}
                    >
                        Continue <ArrowRight className="h-3 w-3" />
                    </Button>
                </div>
            )}
        </div>
    );
}
