import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Loader2,
  Bot,
  User,
  CheckCircle,
  ArrowRight,
  Sparkles,
  FileCheck,
} from "lucide-react";
import type { FormData } from "./types";
import type { AnalysisPrefill } from "../../../../../shared/types";
import { CaseStrengthScore } from "./CaseStrengthScore";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ExtractedFields {
  letterType?: string;
  subject?: string;
  jurisdictionState?: string;
  jurisdictionCity?: string;
  senderName?: string;
  senderAddress?: string;
  senderEmail?: string;
  senderPhone?: string;
  recipientName?: string;
  recipientAddress?: string;
  recipientEmail?: string;
  incidentDate?: string;
  description?: string;
  additionalContext?: string;
  amountOwed?: string;
  desiredOutcome?: string;
  deadlineDate?: string;
  tonePreference?: "firm" | "moderate" | "aggressive";
  priorCommunication?: string;
  deliveryMethod?: string;
  communicationsSummary?: string;
}

interface ConversationalIntakeProps {
  onFieldsExtracted: (fields: Partial<FormData>) => void;
  onSwitchToForm: () => void;
  onReviewAndSubmit: () => void;
  prefillContext?: AnalysisPrefill | null;
  currentForm: FormData;
  hasExhibits: boolean;
}

export function ConversationalIntake({
  onFieldsExtracted,
  onSwitchToForm,
  onReviewAndSubmit,
  prefillContext,
  currentForm,
  hasExhibits,
}: ConversationalIntakeProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [extractedFields, setExtractedFields] = useState<ExtractedFields>({});
  const [completeness, setCompleteness] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [summary, setSummary] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasSentInitial = useRef(false);

  const converseMutation = trpc.intake.converse.useMutation();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (hasSentInitial.current) return;
    hasSentInitial.current = true;

    const welcomeMessage: Message = {
      id: "welcome",
      role: "assistant",
      content: prefillContext
        ? "I've received some details from your document analysis. Let me review what we have and ask a few follow-up questions to complete your intake."
        : "Hi! I'm here to help you draft a legal letter. Tell me about your situation in your own words — what happened, who's involved, and what you'd like to achieve. I'll guide you through the rest.",
      timestamp: new Date(),
    };
    setMessages([welcomeMessage]);

    if (prefillContext && prefillContext.description) {
      setTimeout(() => {
        handleSendMessage(
          `Based on my document analysis: ${prefillContext.description}`,
          true
        );
      }, 500);
    }
  }, []);

  const handleSendMessage = async (
    messageText?: string,
    isAutomatic?: boolean
  ) => {
    const text = messageText || inputValue.trim();
    if (!text) return;

    if (!messageText) setInputValue("");

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const history = messages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const result = await converseMutation.mutateAsync({
        message: text,
        conversationHistory: history,
        prefillContext: prefillContext || undefined,
      });

      setExtractedFields(result.extractedFields);
      setCompleteness(result.completeness);
      setIsComplete(result.isComplete);
      setSummary(result.summary);

      const mappedFields: Partial<FormData> = {};
      const ef = result.extractedFields as ExtractedFields;
      if (ef.letterType) mappedFields.letterType = ef.letterType;
      if (ef.subject) mappedFields.subject = ef.subject;
      if (ef.jurisdictionState)
        mappedFields.jurisdictionState = ef.jurisdictionState;
      if (ef.jurisdictionCity)
        mappedFields.jurisdictionCity = ef.jurisdictionCity;
      if (ef.senderName) mappedFields.senderName = ef.senderName;
      if (ef.senderAddress) mappedFields.senderAddress = ef.senderAddress;
      if (ef.senderEmail) mappedFields.senderEmail = ef.senderEmail;
      if (ef.senderPhone) mappedFields.senderPhone = ef.senderPhone;
      if (ef.recipientName) mappedFields.recipientName = ef.recipientName;
      if (ef.recipientAddress)
        mappedFields.recipientAddress = ef.recipientAddress;
      if (ef.recipientEmail) mappedFields.recipientEmail = ef.recipientEmail;
      if (ef.incidentDate) mappedFields.incidentDate = ef.incidentDate;
      if (ef.description) mappedFields.description = ef.description;
      if (ef.additionalContext)
        mappedFields.additionalContext = ef.additionalContext;
      if (ef.amountOwed) mappedFields.amountOwed = ef.amountOwed;
      if (ef.desiredOutcome) mappedFields.desiredOutcome = ef.desiredOutcome;
      if (ef.deadlineDate) mappedFields.deadlineDate = ef.deadlineDate;
      if (ef.tonePreference) mappedFields.tonePreference = ef.tonePreference;
      if (ef.priorCommunication)
        mappedFields.priorCommunication = ef.priorCommunication;
      if (ef.deliveryMethod) mappedFields.deliveryMethod = ef.deliveryMethod;
      if (ef.communicationsSummary)
        mappedFields.communicationsSummary = ef.communicationsSummary;
      onFieldsExtracted(mappedFields);

      let assistantContent = "";
      if (result.summary && !result.isComplete) {
        assistantContent += result.summary + "\n\n";
      }
      if (
        result.followUpQuestions &&
        result.followUpQuestions.length > 0 &&
        !result.isComplete
      ) {
        assistantContent += result.followUpQuestions
          .map((q: string, i: number) => `${i + 1}. ${q}`)
          .join("\n");
      }
      if (result.isComplete) {
        assistantContent =
          "Great — I have all the information I need! Here's a summary of your case:\n\n" +
          result.summary +
          "\n\nYou can now review the auto-filled form and submit, or continue making changes.";
      }

      if (assistantContent) {
        const assistantMsg: Message = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: assistantContent,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch {
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content:
          "I'm sorry, I had trouble processing that. Could you try rephrasing?",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const filledFieldCount = Object.values(extractedFields).filter(
    (v) => v && String(v).trim()
  ).length;

  return (
    <div className="space-y-4" data-testid="conversational-intake">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-500" />
          <h3 className="text-sm font-semibold text-foreground">
            AI-Guided Intake
          </h3>
          {completeness > 0 && (
            <Badge
              variant={isComplete ? "default" : "secondary"}
              className="text-xs"
              data-testid="badge-completeness"
            >
              {isComplete ? (
                <>
                  <CheckCircle className="w-3 h-3 mr-1" /> Complete
                </>
              ) : (
                `${completeness}% complete`
              )}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSwitchToForm}
          className="text-xs text-muted-foreground hover:text-foreground"
          data-testid="button-switch-to-form"
        >
          Switch to form view <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </div>

      {completeness > 0 && (
        <div className="w-full bg-muted rounded-full h-1.5">
          <div
            className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(completeness, 100)}%` }}
            data-testid="progress-completeness"
          />
        </div>
      )}

      <div
        className="border rounded-xl bg-card overflow-hidden"
        style={{ height: "420px" }}
      >
        <div className="h-full flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                data-testid={`message-${msg.role}-${msg.id}`}
              >
                {msg.role === "assistant" && (
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                    <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  </div>
                )}
              </div>
            ))}
            {converseMutation.isPending && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t p-3 bg-card">
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isComplete
                    ? "Add more details or click 'Review & Submit'..."
                    : "Describe your situation..."
                }
                className="min-h-[44px] max-h-[120px] resize-none text-sm"
                disabled={converseMutation.isPending}
                data-testid="input-conversation"
              />
              <Button
                size="icon"
                onClick={() => handleSendMessage()}
                disabled={
                  !inputValue.trim() || converseMutation.isPending
                }
                className="h-[44px] w-[44px] shrink-0"
                data-testid="button-send-message"
              >
                {converseMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {filledFieldCount > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-blue-700 dark:text-blue-300 font-medium">
              {filledFieldCount} field{filledFieldCount !== 1 ? "s" : ""}{" "}
              auto-filled from conversation
            </div>
            {isComplete && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onSwitchToForm}
                  className="text-xs h-7"
                  data-testid="button-edit-form"
                >
                  <FileCheck className="w-3 h-3 mr-1" />
                  Edit in Form
                </Button>
                <Button
                  size="sm"
                  onClick={onReviewAndSubmit}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7"
                  data-testid="button-review-submit"
                >
                  Review & Submit <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {isComplete && currentForm.letterType && currentForm.jurisdictionState && currentForm.description.length >= 10 && (
        <CaseStrengthScore
          form={currentForm}
          hasExhibits={hasExhibits}
        />
      )}
    </div>
  );
}
