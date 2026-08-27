CREATE POLICY "Admins can upload to app buckets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('clubes2026','campeoes2526','copa2026')
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update app buckets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id IN ('clubes2026','campeoes2526','copa2026')
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id IN ('clubes2026','campeoes2526','copa2026')
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete from app buckets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('clubes2026','campeoes2526','copa2026')
  AND public.has_role(auth.uid(), 'admin')
);