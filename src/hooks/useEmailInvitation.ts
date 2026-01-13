import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isValidEmail } from "@/utils/credentials";

interface UseEmailInvitationProps {
  organizationName: string | null;
}

export function useEmailInvitation({ organizationName }: UseEmailInvitationProps) {
  const [showInviteEmailDialog, setShowInviteEmailDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isSendingInvitation, setIsSendingInvitation] = useState(false);

  const sendInvitation = useCallback(
    async (course: { id: string; title: string } | null) => {
      if (!course || !inviteEmail.trim()) {
        toast.error("Введите email получателя");
        return false;
      }

      if (!isValidEmail(inviteEmail.trim())) {
        toast.error("Введите корректный email адрес");
        return false;
      }

      setIsSendingInvitation(true);
      try {
        const { data, error } = await supabase.functions.invoke(
          "send-course-invitation",
          {
            body: {
              email: inviteEmail.trim(),
              courseName: course.title,
              courseId: course.id,
              organizationName: organizationName,
            },
          }
        );

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        toast.success(`Приглашение отправлено на ${inviteEmail}`);
        setShowInviteEmailDialog(false);
        setInviteEmail("");
        return true;
      } catch (error: any) {
        console.error("Error sending invitation:", error);
        if (error.message?.includes("RESEND_API_KEY")) {
          toast.error("Для отправки email необходимо настроить RESEND_API_KEY");
        } else {
          toast.error(error.message || "Ошибка отправки приглашения");
        }
        return false;
      } finally {
        setIsSendingInvitation(false);
      }
    },
    [inviteEmail, organizationName]
  );

  const sendInvitationDirect = useCallback(
    async (email: string, course: { id: string; title: string } | null) => {
      if (!course) return false;

      if (!isValidEmail(email.trim())) {
        toast.error("Введите корректный email адрес");
        return false;
      }

      setIsSendingInvitation(true);
      try {
        const { data, error } = await supabase.functions.invoke(
          "send-course-invitation",
          {
            body: {
              email: email.trim(),
              courseName: course.title,
              courseId: course.id,
              organizationName: organizationName,
            },
          }
        );

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        toast.success(`Приглашение отправлено на ${email}`);
        setShowInviteEmailDialog(false);
        return true;
      } catch (error: any) {
        console.error("Error sending invitation:", error);
        toast.error(error.message || "Ошибка отправки приглашения");
        return false;
      } finally {
        setIsSendingInvitation(false);
      }
    },
    [organizationName]
  );

  const resetInvitation = useCallback(() => {
    setInviteEmail("");
    setShowInviteEmailDialog(false);
  }, []);

  return {
    showInviteEmailDialog,
    setShowInviteEmailDialog,
    inviteEmail,
    setInviteEmail,
    isSendingInvitation,
    sendInvitation,
    sendInvitationDirect,
    resetInvitation,
  };
}
