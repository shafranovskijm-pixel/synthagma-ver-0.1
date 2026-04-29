import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPlanInfo, type SubscriptionPlan } from "@/constants/subscriptionPlans";
import { useQuery } from "@tanstack/react-query";
import { useOrganizationCore } from "@/hooks/useOrganizationCore";

interface FeatureAccess {
  categoryEnabled: boolean;
  featureEnabled: boolean;
}

interface OrgFeaturesState {
  // Categories
  courses: boolean;
  students: boolean;
  companies: boolean;
  documents: boolean;
  journals: boolean;
  frdo: boolean;
  links: boolean;
  library: boolean;
  webinars: boolean;
  services: boolean;
  settings: boolean;
  student_cabinet: boolean;
  labor_safety: boolean;
  
  // Individual features - courses
  courses_create: boolean;
  courses_publish: boolean;
  courses_categories: boolean;
  courses_lessons: boolean;
  courses_import: boolean;
  courses_ai: boolean;
  courses_preview: boolean;
  courses_duration: boolean;
  
  // Individual features - students
  students_add: boolean;
  students_import: boolean;
  students_enroll: boolean;
  students_progress: boolean;
  students_card: boolean;
  students_credentials: boolean;
  students_email: boolean;
  students_companies: boolean;
  students_bulk: boolean;
  students_filter: boolean;
  
  // Individual features - companies
  companies_list: boolean;
  companies_requisites: boolean;
  companies_bank: boolean;
  companies_stamp: boolean;
  companies_docs: boolean;
  companies_students: boolean;
  
  // Individual features - documents
  docs_contracts: boolean;
  docs_templates: boolean;
  docs_consent: boolean;
  docs_acts: boolean;
  docs_invoices: boolean;
  docs_issuance: boolean;
  docs_orders: boolean;
  docs_bulk: boolean;
  docs_student: boolean;
  docs_journal: boolean;
  
  // Individual features - journals
  journal_attendance_auto: boolean;
  journal_attendance_manual: boolean;
  journal_grades: boolean;
  journal_attestation: boolean;
  journal_docs: boolean;
  journal_blanks: boolean;
  journal_copies: boolean;
  journal_custom: boolean;
  journal_export: boolean;
  
  // Individual features - frdo
  frdo_manage: boolean;
  frdo_check: boolean;
  frdo_bulk: boolean;
  frdo_single: boolean;
  
  // Individual features - links
  links_generate: boolean;
  links_courses: boolean;
  links_companies: boolean;
  links_stats: boolean;
  links_expire: boolean;
  
  // Individual features - library
  library_files: boolean;
  library_folders: boolean;
  library_formats: boolean;
  library_access: boolean;
  
  // Individual features - services
  services_catalog: boolean;
  services_orders: boolean;
  services_status: boolean;
  
  // Individual features - settings
  settings_requisites: boolean;
  settings_theme: boolean;
  settings_menu: boolean;
  settings_student: boolean;
  settings_notifications: boolean;
  
  // Individual features - student cabinet
  cabinet_courses: boolean;
  cabinet_tests: boolean;
  cabinet_docs: boolean;
  cabinet_consent: boolean;
  cabinet_video: boolean;
  cabinet_achievements: boolean;
  cabinet_ai: boolean;
  cabinet_progress: boolean;
}

const defaultFeatures: OrgFeaturesState = {
  // Categories - all enabled by default
  courses: true,
  students: true,
  companies: true,
  documents: true,
  journals: true,
  frdo: true,
  links: true,
  library: true,
  services: true,
  settings: true,
  student_cabinet: true,
  labor_safety: true,
  webinars: true,
  
  // Individual features - all enabled by default
  courses_create: true,
  courses_publish: true,
  courses_categories: true,
  courses_lessons: true,
  courses_import: true,
  courses_ai: true,
  courses_preview: true,
  courses_duration: true,
  
  students_add: true,
  students_import: true,
  students_enroll: true,
  students_progress: true,
  students_card: true,
  students_credentials: true,
  students_email: true,
  students_companies: true,
  students_bulk: true,
  students_filter: true,
  
  companies_list: true,
  companies_requisites: true,
  companies_bank: true,
  companies_stamp: true,
  companies_docs: true,
  companies_students: true,
  
  docs_contracts: true,
  docs_templates: true,
  docs_consent: true,
  docs_acts: true,
  docs_invoices: true,
  docs_issuance: true,
  docs_orders: true,
  docs_bulk: true,
  docs_student: true,
  docs_journal: true,
  
  journal_attendance_auto: true,
  journal_attendance_manual: true,
  journal_grades: true,
  journal_attestation: true,
  journal_docs: true,
  journal_blanks: true,
  journal_copies: true,
  journal_custom: true,
  journal_export: true,
  
  frdo_manage: true,
  frdo_check: true,
  frdo_bulk: true,
  frdo_single: true,
  
  links_generate: true,
  links_courses: true,
  links_companies: true,
  links_stats: true,
  links_expire: true,
  
  library_files: true,
  library_folders: true,
  library_formats: true,
  library_access: true,
  
  services_catalog: true,
  services_orders: true,
  services_status: true,
  
  settings_requisites: true,
  settings_theme: true,
  settings_menu: true,
  settings_student: true,
  settings_notifications: true,
  
  cabinet_courses: true,
  cabinet_tests: true,
  cabinet_docs: true,
  cabinet_consent: true,
  cabinet_video: true,
  cabinet_achievements: true,
  cabinet_ai: true,
  cabinet_progress: true,
};

export function useOrgFeatures(organizationId: string | null) {
  const [features, setFeatures] = useState<OrgFeaturesState>(defaultFeatures);
  const [loading, setLoading] = useState(true);

  const fetchFeatures = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    try {
      // Fetch global settings + subscription plan
      const [globalCategoriesResult, globalFeaturesResult, orgCategoriesResult, orgFeaturesResult, orgPlanResult] = await Promise.all([
        supabase.from("system_feature_categories").select("category_id, is_enabled"),
        supabase.from("system_features").select("feature_id, is_enabled"),
        supabase.from("organization_feature_categories").select("category_id, is_enabled").eq("organization_id", organizationId),
        supabase.from("organization_features").select("feature_id, is_enabled").eq("organization_id", organizationId),
        supabase.from("organizations").select("subscription_plan, custom_enabled_categories").eq("id", organizationId).single(),
      ]);

      const newFeatures = { ...defaultFeatures };

      // Apply global category settings
      if (globalCategoriesResult.data) {
        for (const cat of globalCategoriesResult.data) {
          if (cat.category_id in newFeatures) {
            (newFeatures as any)[cat.category_id] = cat.is_enabled;
          }
        }
      }

      // Apply global feature settings
      if (globalFeaturesResult.data) {
        for (const feature of globalFeaturesResult.data) {
          if (feature.feature_id in newFeatures) {
            (newFeatures as any)[feature.feature_id] = feature.is_enabled;
          }
        }
      }

      // Override with org-specific category settings
      if (orgCategoriesResult.data) {
        for (const cat of orgCategoriesResult.data) {
          if (cat.category_id in newFeatures) {
            (newFeatures as any)[cat.category_id] = cat.is_enabled;
          }
        }
      }

      // Override with org-specific feature settings
      if (orgFeaturesResult.data) {
        for (const feature of orgFeaturesResult.data) {
          if (feature.feature_id in newFeatures) {
            (newFeatures as any)[feature.feature_id] = feature.is_enabled;
          }
        }
      }

      // Subscription plan is the FINAL authority on categories
      const subscriptionPlan = (orgPlanResult.data?.subscription_plan || 'free') as SubscriptionPlan;
      const customEnabledCategories: string[] = (orgPlanResult.data as any)?.custom_enabled_categories || [];
      const planInfo = getPlanInfo(subscriptionPlan);
      const allCategories = ['courses', 'students', 'companies', 'documents', 'journals', 'frdo', 'links', 'library', 'services', 'settings', 'student_cabinet', 'labor_safety', 'webinars'];
      
      for (const cat of allCategories) {
        if (planInfo.enabledCategories.includes(cat)) {
          (newFeatures as any)[cat] = true;
        } else {
          (newFeatures as any)[cat] = false;
        }
      }

      // Apply custom enabled categories (override plan restrictions)
      for (const cat of customEnabledCategories) {
        if (cat in newFeatures) {
          (newFeatures as any)[cat] = true;
        }
      }

      // Disable AI if plan doesn't support it
      if (!planInfo.limits.aiEnabled) {
        newFeatures.courses_ai = false;
      }

      setFeatures(newFeatures);
    } catch (error) {
      console.error("Error fetching org features:", error);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  // Realtime subscription for plan changes
  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel(`org-features-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'organizations',
          filter: `id=eq.${organizationId}`,
        },
        () => { fetchFeatures(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [organizationId, fetchFeatures]);

  // Helper function to check if a feature is enabled
  const isEnabled = useCallback((featureId: keyof OrgFeaturesState): boolean => {
    return features[featureId] ?? true;
  }, [features]);

  // Helper to check if a category and its feature are both enabled
  const isFeatureEnabled = useCallback((categoryId: keyof OrgFeaturesState, featureId: keyof OrgFeaturesState): boolean => {
    const categoryEnabled = features[categoryId] ?? true;
    const featureEnabled = features[featureId] ?? true;
    return categoryEnabled && featureEnabled;
  }, [features]);

  return {
    features,
    loading,
    isEnabled,
    isFeatureEnabled,
    refetch: fetchFeatures,
  };
}
