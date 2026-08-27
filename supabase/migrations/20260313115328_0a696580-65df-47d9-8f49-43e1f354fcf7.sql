
-- Drop the overly permissive SELECT policy
DROP POLICY "Authenticated users can validate codes" ON public.invite_codes;

-- Create restricted SELECT policy: only creators can see their own codes
CREATE POLICY "Users can view codes they created"
ON public.invite_codes
FOR SELECT
TO authenticated
USING (created_by = auth.uid());
