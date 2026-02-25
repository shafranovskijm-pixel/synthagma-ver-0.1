import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Student } from "@/types/shared";

interface Organization {
  id: string;
  name: string;
  email: string;
  contact_name: string | null;
  phone: string | null;
  inn: string | null;
  ai_enabled: boolean;
  created_at: string;
  studentsCount?: number;
  coursesCount?: number;
}

interface OrgDocument {
  id: string;
  type: string;
  name: string;
  file_url: string | null;
  created_at: string;
}

interface UseOrganizationsTabProps {
  activeTab: string;
}

export function useOrganizationsTab({ activeTab }: UseOrganizationsTabProps) {
  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [showOrgDetails, setShowOrgDetails] = useState(false);
  const [orgDocuments, setOrgDocuments] = useState<OrgDocument[]>([]);
  const [orgStudents, setOrgStudents] = useState<Student[]>([]);
  const [isLoadingOrgDetails, setIsLoadingOrgDetails] = useState(false);

  // Fetch all organizations
  useEffect(() => {
    const fetchAllOrganizations = async () => {
      if (activeTab !== "organizations") return;
      setIsLoadingOrgs(true);
      try {
        const { data: orgs, error } = await supabase
          .from("organizations")
          .select("*")
          .order("created_at", { ascending: false });
        
        if (error) throw error;
        if (!orgs || orgs.length === 0) {
          setAllOrganizations([]);
          return;
        }

        const orgIds = orgs.map(o => o.id);

        const [profilesRes, coursesRes] = await Promise.all([
          supabase.from("profiles").select("organization_id").in("organization_id", orgIds),
          supabase.from("courses").select("organization_id").in("organization_id", orgIds),
        ]);

        const userCounts: Record<string, number> = {};
        const courseCounts: Record<string, number> = {};
        (profilesRes.data || []).forEach((p: any) => {
          userCounts[p.organization_id] = (userCounts[p.organization_id] || 0) + 1;
        });
        (coursesRes.data || []).forEach((c: any) => {
          courseCounts[c.organization_id] = (courseCounts[c.organization_id] || 0) + 1;
        });

        setAllOrganizations(orgs.map(org => ({
          ...org,
          coursesCount: courseCounts[org.id] || 0,
          studentsCount: userCounts[org.id] || 0,
        })));
      } catch (error) {
        console.error("Error fetching organizations:", error);
      } finally {
        setIsLoadingOrgs(false);
      }
    };
    
    fetchAllOrganizations();
  }, [activeTab]);

  const handleViewOrg = useCallback(async (org: Organization) => {
    setSelectedOrg(org);
    setShowOrgDetails(true);
    setIsLoadingOrgDetails(true);
    
    try {
      const { data: docs } = await supabase
        .from("org_documents")
        .select("*")
        .eq("organization_id", org.id)
        .order("created_at", { ascending: false });
      
      setOrgDocuments(docs || []);
      
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, login, generated_password")
        .eq("organization_id", org.id);
      
      const studentsList: Student[] = (profiles || []).map((p) => ({
        id: p.id,
        user_id: p.user_id,
        enrollment_id: null,
        name: p.full_name || "Без имени",
        email: p.email || "",
        login: p.login || null,
        generated_password: p.generated_password || null,
        course: null,
        course_id: null,
        progress: 0,
        lastActivity: null,
        status: null,
      }));
      
      setOrgStudents(studentsList);
    } catch (error) {
      console.error("Error fetching org details:", error);
      toast.error("Ошибка загрузки данных");
    } finally {
      setIsLoadingOrgDetails(false);
    }
  }, []);

  const filterOrganizations = useCallback(
    (searchQuery: string) => {
      return allOrganizations.filter(
        (org) =>
          org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          org.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (org.inn && org.inn.includes(searchQuery))
      );
    },
    [allOrganizations]
  );

  return {
    allOrganizations,
    isLoadingOrgs,
    selectedOrg,
    setSelectedOrg,
    showOrgDetails,
    setShowOrgDetails,
    orgDocuments,
    orgStudents,
    isLoadingOrgDetails,
    handleViewOrg,
    filterOrganizations,
  };
}

export type { Organization };
