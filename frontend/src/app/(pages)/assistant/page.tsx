"use client";

import { useRouter } from "next/navigation";
import { useAssistantChat } from "@/app/hooks/useAssistantChat";
import { InitialView } from "@/app/components/assistant/InitialView";
import { ChatView } from "@/app/components/assistant/ChatView";
import BudgetBanner from "@/app/components/BudgetBanner";
import type { Message } from "@/app/components/shared/types";

export default function AssistantPage() {
    const router = useRouter();
    const {
        messages,
        isResponseLoading,
        handleChat,
        handleNewChat,
        cancel,
        chatId,
    } = useAssistantChat();

    async function handleInitialSubmit(message: Message) {
        const chatId = await handleNewChat(message);
        if (chatId) router.push(`/assistant/chat/${chatId}`);
    }

    if (messages.length === 0) {
        return (
            <div className="flex h-full flex-col">
                <BudgetBanner />
                <div className="flex-1">
                    <InitialView
                        onSubmit={(message) =>
                            void handleInitialSubmit(message)
                        }
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            <BudgetBanner />
            <div className="min-h-0 flex-1">
                <ChatView
                    chatId={chatId}
                    messages={messages}
                    isResponseLoading={isResponseLoading}
                    handleChat={handleChat}
                    cancel={cancel}
                />
            </div>
        </div>
    );
}
