import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Send, Trash2, Mail, Clock, MessageSquare, CheckCircle2, Flame } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { ru } from "date-fns/locale";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { getEmailHtml, getEmailSubject } from "./broadcast/emailTemplates";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CampaignsManager } from "./broadcast/CampaignsManager";
import { EmailTemplatesManager } from "@/components/shared/sales/EmailTemplatesManager";
import { SuppressionListManager } from "./broadcast/SuppressionListManager";
import { DomainReputationCheck } from "./broadcast/DomainReputationCheck";
import { DripCampaignsManager } from "./broadcast/DripCampaignsManager";
import { ColdyMailingLayout } from "./broadcast/ColdyMailingLayout";


interface Announcement {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
  created_by: string | null;
}

interface OrgForMailing {
  id: string;
  name: string;
  email: string | null;
  updated_at: string;
  daysInactive: number;
}

interface EmailToken {
  id: string;
  organization_id: string;
  organization_email: string;
  action_type: string;
  template_name: string;
  used: boolean;
  created_at: string;
  used_at: string | null;
}

type TemplateType = "inactive" | "welcome" | "frdo_pain" | null;

export function BroadcastManager() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // Email mailing state
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>(null);
  const [organizations, setOrganizations] = useState<OrgForMailing[]>([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set());
  const [inactivityDays, setInactivityDays] = useState("30");
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });
  const [emailHistory, setEmailHistory] = useState<EmailToken[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchAnnouncements = async () => {
    const { data } = await supabase
      .from("platform_announcements")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setAnnouncements(data);
    setLoading(false);
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  // Load organizations when template selected
  useEffect(() => {
    if (selectedTemplate) {
      loadOrganizations();
      loadEmailHistory();
    }
  }, [selectedTemplate, inactivityDays]);

  const loadOrganizations = async () => {
    setLoadingOrgs(true);
    const { data } = await supabase
      .from("organizations")
      .select("id, name, email, updated_at")
      .order("name");

    if (data) {
      const now = new Date();
      const orgs: OrgForMailing[] = data
        .filter(o => o.email)
        .map(o => ({
          ...o,
          daysInactive: differenceInDays(now, new Date(o.updated_at)) }));

      if (selectedTemplate === "inactive") {
        const threshold = parseInt(inactivityDays);
        setOrganizations(orgs.filter(o => o.daysInactive >= threshold));
      } else {
        setOrganizations(orgs);
      }
    }
    setSelectedOrgIds(new Set());
    setLoadingOrgs(false);
  };

  const loadEmailHistory = async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from("email_action_tokens")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setEmailHistory(data as EmailToken[]);
    setLoadingHistory(false);
  };

  const handleSend = async () => {
    if (!content.trim()) {
      toast.error("Введите текст сообщения");
      return;
    }
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("platform_announcements").insert({
        title: title.trim() || null,
        content: content.trim(),
        created_by: user?.id || null });
      if (error) throw error;
      toast.success("Рассылка отправлена");
      setTitle("");
      setContent("");
      fetchAnnouncements();
    } catch (err: any) {
      toast.error("Ошибка: " + err.message);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("platform_announcements").delete().eq("id", id);
    if (error) {
      toast.error("Ошибка удаления");
    } else {
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      toast.success("Удалено");
    }
  };

  const toggleOrg = (id: string) => {
    setSelectedOrgIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedOrgIds.size === organizations.length) {
      setSelectedOrgIds(new Set());
    } else {
      setSelectedOrgIds(new Set(organizations.map(o => o.id)));
    }
  };

  // Email templates extracted to broadcast/emailTemplates.ts

  const handleSendEmails = async () => {
    if (selectedOrgIds.size === 0) {
      toast.error("Выберите хотя бы одну организацию");
      return;
    }

    const selectedOrgs = organizations.filter(o => selectedOrgIds.has(o.id));
    setSendingEmails(true);
    setSendProgress({ current: 0, total: selectedOrgs.length });

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    let successCount = 0;
    let failCount = 0;

    for (const org of selectedOrgs) {
      try {
        // Create token
        const actionType = selectedTemplate === "inactive" ? "help_request" : "consultation_request";
        const { data: tokenData, error: tokenError } = await supabase
          .from("email_action_tokens")
          .insert({
            organization_id: org.id,
            organization_email: org.email!,
            action_type: actionType,
            template_name: selectedTemplate! })
          .select("id")
          .single();

        if (tokenError || !tokenData) {
          failCount++;
          setSendProgress(p => ({ ...p, current: p.current + 1 }));
          continue;
        }

        const publishedUrl = "https://sintagma.com.ru";
        const actionUrl = `${publishedUrl}/email-response?token=${tokenData.id}`;
        const html = getEmailHtml(selectedTemplate as any, org.name, actionUrl);
        const subject = getEmailSubject(selectedTemplate as any);

        await supabase.functions.invoke("send-email", {
          body: {
            to: org.email,
            subject,
            html,
            from: "Sintagma <support@sintagma.com.ru>" } });

        successCount++;
      } catch (err) {
        console.error("Error sending to", org.email, err);
        failCount++;
      }
      setSendProgress(p => ({ ...p, current: p.current + 1 }));
    }

    setSendingEmails(false);
    if (failCount === 0) {
      toast.success(`Отправлено: ${successCount} писем`);
    } else {
      toast.warning(`Отправлено: ${successCount}, ошибок: ${failCount}`);
    }
    loadEmailHistory();
  };

  // Legacy state (announcements + org email templates) сохранён для обратной совместимости,
  // но UI полностью заменён Coldy-layout'ом. Всё есть в левом сайдбаре.
  void title; void content; void sending; void announcements; void loading;
  void selectedTemplate; void organizations; void selectedOrgIds; void inactivityDays;
  void loadingOrgs; void sendingEmails; void sendProgress; void emailHistory; void loadingHistory;
  void setTitle; void setContent; void setSelectedTemplate; void setInactivityDays;
  void handleSend; void handleDelete; void toggleOrg; void toggleAll; void handleSendEmails;

  return <ColdyMailingLayout />;
}

