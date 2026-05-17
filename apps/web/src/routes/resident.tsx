import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  IconCamera,
  IconKeyboard,
  IconPhotoUp,
  IconPlayerStop,
  IconQrcode,
  IconUpload,
} from '@tabler/icons-react';
import QRCode from 'qrcode';
import QrScanner from 'qr-scanner';
import { type ChangeEvent, type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { searchFamiliesData } from '@/data';
import {
  getResidentFamilyAccessData,
  getResidentSessionData,
  type ResidentFamilyAccessData,
  type ResidentSessionData,
  updateResidentFamilyStatusData,
  updateResidentHouseReportData,
} from '@/features/resident/_data';
import { Constants, type Database } from '@/lib/supabase/types';

export const Route = createFileRoute('/resident')({
  component: ResidentPortalPage,
});

const ACCESS_SEARCH_LIMIT = 6;
const QR_ACCESS_SOURCE_LABELS: Record<ResidentAccessMode, string> = {
  scan: 'Scan QR',
  upload: 'Upload QR',
  manual: 'Manual entry',
};

function ResidentPortalPage() {
  const [session, setSession] = useState<ResidentSessionData | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [residentError, setResidentError] = useState<string | null>(null);

  const sessionMutation = useMutation({
    mutationFn: getResidentSessionData,
    onSuccess: data => {
      setSession(data);
      setFeedback(null);
      setResidentError(null);
    },
  });
  const familyMutation = useMutation({
    mutationFn: updateResidentFamilyStatusData,
    onSuccess: family => {
      setSession(current => (current ? { ...current, family } : current));
      setFeedback('Family status updated.');
      setResidentError(null);
    },
  });
  const houseMutation = useMutation({
    mutationFn: updateResidentHouseReportData,
    onSuccess: house => {
      setSession(current => (current ? { ...current, house } : current));
      setFeedback('Household report submitted.');
      setResidentError(null);
    },
  });

  function handleAccessSubmit(credentials: ResidentAccessCredentials) {
    sessionMutation.mutate(credentials);
  }

  function handleFamilySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const form = new FormData(event.currentTarget);
    const totalMembers = session.family.total_members;
    const currentInsideCount = readFormNumber(form, 'currentInsideCount');
    const evacuatedCount = readFormNumber(form, 'evacuatedCount');
    const missingOrUnconfirmedCount = readFormNumber(form, 'missingOrUnconfirmedCount');

    if (currentInsideCount + evacuatedCount + missingOrUnconfirmedCount > totalMembers) {
      familyMutation.reset();
      setFeedback(null);
      setResidentError('Family counts cannot exceed total members.');
      return;
    }

    familyMutation.mutate({
      familyId: session.family.id,
      payload: {
        current_inside_count: currentInsideCount,
        evacuated_count: evacuatedCount,
        missing_or_unconfirmed_count: missingOrUnconfirmedCount,
        needs_assistance: form.get('needsAssistance') === 'on',
        notes: readFormString(form, 'notes') || null,
      },
    });
  }

  function handleHouseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const form = new FormData(event.currentTarget);
    houseMutation.mutate({
      houseId: session.house.id,
      familyCode: session.family.family_code,
      payload: {
        current_status: readFormString(
          form,
          'currentStatus'
        ) as Database['public']['Enums']['house_status'],
        water_level: readFormString(
          form,
          'waterLevel'
        ) as Database['public']['Enums']['water_level'],
      },
    });
  }

  return (
    <main className="page page--wide">
      <section className="toolbar">
        <div>
          <p className="eyebrow">Resident facing</p>
          <h1>Family rescue portal</h1>
          <p className="toolbar-copy">
            Enter your family code to view your family status and nearby evacuation centers.
          </p>
        </div>
        {session ? (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setSession(null);
              setFeedback(null);
              setResidentError(null);
            }}
          >
            End session
          </button>
        ) : null}
      </section>

      {!session ? (
        <ResidentAccessForm
          error={sessionMutation.error}
          isSubmitting={sessionMutation.isPending}
          onSubmit={handleAccessSubmit}
        />
      ) : (
        <section className="resident-workspace">
          <ResidentSummary session={session} />
          <FamilyMembersTable session={session} />
          <EvacuationCentersList session={session} />
          <ResidentUpdateForms
            feedback={feedback}
            familyError={familyMutation.error}
            houseError={houseMutation.error}
            residentError={residentError}
            isFamilySubmitting={familyMutation.isPending}
            isHouseSubmitting={houseMutation.isPending}
            session={session}
            onFamilySubmit={handleFamilySubmit}
            onHouseSubmit={handleHouseSubmit}
          />
        </section>
      )}
    </main>
  );
}

type ResidentAccessFormProps = {
  error: Error | null;
  isSubmitting: boolean;
  onSubmit: (credentials: ResidentAccessCredentials) => void;
};

type ResidentAccessCredentials = {
  familyCode: string;
  pinCode: string;
};

type ResidentAccessMode = 'scan' | 'upload' | 'manual';

function ResidentAccessForm({ error, isSubmitting, onSubmit }: ResidentAccessFormProps) {
  const uploadInputId = useId();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [familyCode, setFamilyCode] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [activeMode, setActiveMode] = useState<ResidentAccessMode>('manual');
  const [validatedFamily, setValidatedFamily] = useState<ResidentFamilyAccessData | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const familyOptionsQuery = useQuery({
    queryKey: ['resident-access-options', 'families', familyCode.trim()],
    queryFn: async () => {
      const searchText = familyCode.trim();
      const response = await searchFamiliesData({
        limit: ACCESS_SEARCH_LIMIT,
        sortBy: 'family_name',
        orderBy: 'asc',
        filters: searchText ? { searchText } : undefined,
      });

      return response.records.map(family => ({
        id: family.id,
        code: family.family_code,
        title: family.family_name,
        subtitle: family.head_of_family,
      }));
    },
    enabled: familyCode.trim().length >= 2,
    staleTime: 30_000,
  });

  const familyValidationMutation = useMutation({
    mutationFn: getResidentFamilyAccessData,
    onSuccess: family => {
      setValidatedFamily(family);
      setFamilyCode(family.family_code);
      setPinCode('');
      setAccessError(null);
      setScanStatus(`Family code validated through ${QR_ACCESS_SOURCE_LABELS[activeMode]}.`);
    },
    onError: (validationError: Error) => {
      setValidatedFamily(null);
      setPinCode('');
      setAccessError(validationError.message);
    },
  });

  const normalizedFamilyCode = normalizeResidentFamilyCode(familyCode);
  const isFamilyCodeValidated =
    validatedFamily !== null &&
    normalizeResidentFamilyCode(validatedFamily.family_code) === normalizedFamilyCode;
  const isBusy = isSubmitting || familyValidationMutation.isPending;

  useEffect(() => {
    if (!isCameraActive) return;

    const video = videoRef.current;

    if (!video) {
      setIsCameraActive(false);
      return;
    }

    let isMounted = true;
    const scanner = new QrScanner(
      video,
      result => {
        const nextFamilyCode = parseResidentQrAccessCode(result.data);

        if (!nextFamilyCode) return;

        setFamilyCode(nextFamilyCode);
        setScanStatus('QR scanned. Validating family code...');
        familyValidationMutation.mutate({ familyCode: nextFamilyCode });
        setIsCameraActive(false);
      },
      {
        preferredCamera: 'environment',
        highlightScanRegion: true,
        highlightCodeOutline: true,
        returnDetailedScanResult: true,
        onDecodeError: () => {},
      }
    );

    scanner.start().catch((cameraError: unknown) => {
      if (!isMounted) return;

      setAccessError(getErrorMessage(cameraError, 'Camera scanner could not start.'));
      setIsCameraActive(false);
    });

    return () => {
      isMounted = false;
      scanner.destroy();
    };
  }, [isCameraActive]);

  function resetValidatedFamilyFor(nextValue: string) {
    if (
      validatedFamily &&
      normalizeResidentFamilyCode(validatedFamily.family_code) !==
        normalizeResidentFamilyCode(nextValue)
    ) {
      setValidatedFamily(null);
      setPinCode('');
    }
  }

  function handleFamilyCodeChange(nextValue: string) {
    resetValidatedFamilyFor(nextValue);
    setAccessError(null);
    setScanStatus(null);
    setFamilyCode(nextValue);
  }

  function validateFamilyCode(nextValue = familyCode) {
    const nextFamilyCode = parseResidentQrAccessCode(nextValue);

    if (!nextFamilyCode) {
      setValidatedFamily(null);
      setPinCode('');
      setAccessError('Enter or scan a family code first.');
      return;
    }

    setFamilyCode(nextFamilyCode);
    setScanStatus('Validating family code...');
    familyValidationMutation.mutate({ familyCode: nextFamilyCode });
  }

  async function handleQrUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';

    if (!file) return;

    setActiveMode('upload');
    setScanStatus('Reading QR image...');
    setAccessError(null);

    try {
      const result = await QrScanner.scanImage(file, {
        returnDetailedScanResult: true,
        alsoTryWithoutScanRegion: true,
      });
      const nextFamilyCode = parseResidentQrAccessCode(result.data);

      if (!nextFamilyCode) {
        throw new Error('QR code did not contain a family code.');
      }

      setFamilyCode(nextFamilyCode);
      setScanStatus('QR uploaded. Validating family code...');
      familyValidationMutation.mutate({ familyCode: nextFamilyCode });
    } catch (uploadError) {
      setValidatedFamily(null);
      setPinCode('');
      setAccessError(getErrorMessage(uploadError, 'No family QR code was found in that image.'));
      setScanStatus(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isFamilyCodeValidated) {
      validateFamilyCode();
      return;
    }

    if (!pinCode.trim()) {
      setAccessError('Enter the family PIN code to start the session.');
      return;
    }

    onSubmit({
      familyCode: validatedFamily.family_code,
      pinCode: pinCode.trim(),
    });
  }

  return (
    <form className="resident-access-form" onSubmit={handleSubmit}>
      <div className="resident-access-modes" role="tablist" aria-label="Family access method">
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'scan'}
          onClick={() => {
            setActiveMode('scan');
          }}
        >
          <IconCamera aria-hidden="true" />
          Scan QR
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'upload'}
          onClick={() => {
            setIsCameraActive(false);
            setActiveMode('upload');
          }}
        >
          <IconUpload aria-hidden="true" />
          Upload QR
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'manual'}
          onClick={() => {
            setIsCameraActive(false);
            setActiveMode('manual');
          }}
        >
          <IconKeyboard aria-hidden="true" />
          Type code
        </button>
      </div>

      {activeMode === 'scan' ? (
        <section className="resident-access-panel" aria-label="Scan QR">
          <div className="resident-qr-scanner">
            <video ref={videoRef} muted playsInline aria-label="QR scanner camera preview" />
          </div>
          <div className="resident-access-actions">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setAccessError(null);
                setScanStatus('Point the camera at the family QR code.');
                setIsCameraActive(true);
              }}
            >
              <IconCamera aria-hidden="true" />
              Start camera
            </button>
            {isCameraActive ? (
              <button
                className="button--secondary"
                type="button"
                onClick={() => {
                  setIsCameraActive(false);
                  setScanStatus(null);
                }}
              >
                <IconPlayerStop aria-hidden="true" />
                Stop
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeMode === 'upload' ? (
        <section className="resident-access-panel" aria-label="Upload QR">
          <label className="resident-upload-dropzone" htmlFor={uploadInputId}>
            <IconPhotoUp aria-hidden="true" />
            <span>Upload a family QR image</span>
            <small>PNG, JPG, or a clear screenshot works best.</small>
          </label>
          <input
            id={uploadInputId}
            className="resident-upload-input"
            type="file"
            accept="image/*"
            disabled={isBusy}
            onChange={handleQrUpload}
          />
        </section>
      ) : null}

      {activeMode === 'manual' ? (
        <section className="resident-access-panel" aria-label="Manual family code entry">
          <ResidentAccessCombobox
            label="Family code"
            name="familyCode"
            value={familyCode}
            options={familyOptionsQuery.data ?? []}
            isLoading={familyOptionsQuery.isFetching}
            error={familyOptionsQuery.error}
            placeholder="Type or search family"
            hasSearchStarted={familyCode.trim().length >= 2}
            disabled={isBusy}
            onInputChange={handleFamilyCodeChange}
            onSelect={option => {
              setFamilyCode(option.code);
              setAccessError(null);
              setScanStatus('Family code selected. Validating...');
              familyValidationMutation.mutate({ familyCode: option.code });
            }}
          />
          <button
            className="button--secondary"
            type="button"
            disabled={isBusy}
            onClick={() => {
              validateFamilyCode();
            }}
          >
            Validate code
          </button>
        </section>
      ) : null}

      {activeMode !== 'manual' ? (
        <label className="resident-family-code-readout">
          <span>Family code</span>
          <input
            name="familyCode"
            value={familyCode}
            placeholder="Scan or upload QR"
            disabled={isBusy}
            onChange={event => {
              handleFamilyCodeChange(event.currentTarget.value);
            }}
          />
        </label>
      ) : null}

      {isFamilyCodeValidated ? (
        <section className="resident-pin-panel">
          <div className="resident-access-validation">
            <IconQrcode aria-hidden="true" />
            <div>
              <strong>{validatedFamily.family_code}</strong>
              <span>
                {validatedFamily.family_name} · {validatedFamily.head_of_family}
              </span>
            </div>
          </div>
          <ResidentFamilyQrPreview familyCode={validatedFamily.family_code} />
          <label className="resident-pin-field">
            <span>PIN code</span>
            <input
              name="pinCode"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              value={pinCode}
              disabled={isSubmitting}
              required
              onChange={event => {
                setAccessError(null);
                setPinCode(event.currentTarget.value);
              }}
            />
          </label>
        </section>
      ) : null}

      <button type="submit" disabled={isBusy}>
        {isFamilyCodeValidated ? 'Start session' : 'Continue'}
      </button>
      {scanStatus ? <p className="resident-access-status">{scanStatus}</p> : null}
      {accessError ? <p className="error-state">{accessError}</p> : null}
      {error ? <p className="error-state">{error.message}</p> : null}
    </form>
  );
}

type AccessComboboxOption = {
  id: string;
  code: string;
  title: string;
  subtitle?: string | null;
};

type ResidentAccessComboboxProps = {
  label: string;
  name: string;
  value: string;
  options: AccessComboboxOption[];
  isLoading: boolean;
  error: Error | null;
  placeholder: string;
  hasSearchStarted: boolean;
  disabled: boolean;
  onInputChange: (value: string) => void;
  onSelect: (option: AccessComboboxOption) => void;
};

function ResidentAccessCombobox({
  label,
  name,
  value,
  options,
  isLoading,
  error,
  placeholder,
  hasSearchStarted,
  disabled,
  onInputChange,
  onSelect,
}: ResidentAccessComboboxProps) {
  const inputId = useId();
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const showListbox = isOpen && !disabled;

  return (
    <div
      className="access-combobox"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <label htmlFor={inputId}>{label}</label>
      <div className="access-combobox-control">
        <input
          id={inputId}
          name={name}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          required
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={showListbox}
          value={value}
          onChange={event => {
            onInputChange(event.currentTarget.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              setIsOpen(false);
            }
          }}
        />
        {showListbox ? (
          <div id={listboxId} className="access-combobox-list" role="listbox">
            {isLoading ? <p>Searching...</p> : null}
            {error ? <p>Search unavailable</p> : null}
            {!isLoading && !error && hasSearchStarted && options.length === 0 ? (
              <p>No matching records</p>
            ) : null}
            {!isLoading && !error && !hasSearchStarted ? <p>Type at least 2 characters</p> : null}
            {!error
              ? options.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={value === option.code}
                    onMouseDown={event => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      onSelect(option);
                      setIsOpen(false);
                    }}
                  >
                    <span>{option.code}</span>
                    <strong>{option.title}</strong>
                    {option.subtitle ? <small>{option.subtitle}</small> : null}
                  </button>
                ))
              : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ResidentFamilyQrPreview({ familyCode }: { familyCode: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    QRCode.toDataURL(familyCode, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 160,
      color: {
        dark: '#0f172b',
        light: '#ffffff',
      },
    })
      .then(url => {
        if (isCurrent) {
          setQrDataUrl(url);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setQrDataUrl(null);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [familyCode]);

  return (
    <div className="resident-family-qr-preview">
      {qrDataUrl ? <img alt={`QR code for ${familyCode}`} src={qrDataUrl} /> : <span />}
      <div>
        <strong>Family QR</strong>
        <small>{familyCode}</small>
      </div>
    </div>
  );
}

function ResidentSummary({ session }: { session: ResidentSessionData }) {
  return (
    <section className="resident-summary" aria-label="Resident session summary">
      <article>
        <span>{session.lgu.name}</span>
        <p>
          {session.lgu.city_or_municipality}, {session.lgu.province}
        </p>
      </article>
      <article>
        <span>{session.barangay.name}</span>
        <p>{session.house.address}</p>
      </article>
      <article>
        <span>{session.family.family_name}</span>
        <p>{session.family.total_members} registered family members</p>
      </article>
      <article>
        <span>{session.house.current_status}</span>
        <p>{session.house.water_level} water level</p>
      </article>
    </section>
  );
}

function FamilyMembersTable({ session }: { session: ResidentSessionData }) {
  return (
    <section className="resident-section">
      <div className="crm-heading">
        <div>
          <p className="eyebrow">Family members</p>
          <h2>Your household roster</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Age</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {session.residents.map(resident => (
              <tr key={resident.id}>
                <td>
                  {resident.first_name} {resident.last_name}
                </td>
                <td>{resident.phone_number ?? 'Not set'}</td>
                <td>{resident.current_status}</td>
                <td>{resident.age ?? 'Not set'}</td>
                <td>{formatResidentFlags(resident)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EvacuationCentersList({ session }: { session: ResidentSessionData }) {
  return (
    <section className="resident-section">
      <div className="crm-heading">
        <div>
          <p className="eyebrow">Evacuation centers</p>
          <h2>Available centers in your LGU</h2>
        </div>
      </div>
      <div className="resident-center-list">
        {session.evacuationCenters.map(center => (
          <article key={center.id}>
            <div>
              <h3>{center.name}</h3>
              <p>{center.address}</p>
            </div>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{center.status}</dd>
              </div>
              <div>
                <dt>Occupancy</dt>
                <dd>
                  {center.current_occupancy} / {center.capacity}
                </dd>
              </div>
              <div>
                <dt>Supplies</dt>
                <dd>{formatCenterSupplies(center)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

type ResidentUpdateFormsProps = {
  feedback: string | null;
  familyError: Error | null;
  houseError: Error | null;
  residentError: string | null;
  isFamilySubmitting: boolean;
  isHouseSubmitting: boolean;
  session: ResidentSessionData;
  onFamilySubmit: (event: FormEvent<HTMLFormElement>) => void;
  onHouseSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function ResidentUpdateForms({
  feedback,
  familyError,
  houseError,
  residentError,
  isFamilySubmitting,
  isHouseSubmitting,
  session,
  onFamilySubmit,
  onHouseSubmit,
}: ResidentUpdateFormsProps) {
  return (
    <section className="resident-actions-grid">
      <form className="record-form" onSubmit={onFamilySubmit}>
        <div>
          <p className="eyebrow">Update</p>
          <h2>Family status</h2>
        </div>
        <label className="record-field">
          <span>Inside house</span>
          <input
            name="currentInsideCount"
            type="number"
            min="0"
            defaultValue={session.family.current_inside_count}
            required
          />
        </label>
        <label className="record-field">
          <span>Evacuated</span>
          <input
            name="evacuatedCount"
            type="number"
            min="0"
            defaultValue={session.family.evacuated_count}
            required
          />
        </label>
        <label className="record-field">
          <span>Missing or unconfirmed</span>
          <input
            name="missingOrUnconfirmedCount"
            type="number"
            min="0"
            defaultValue={session.family.missing_or_unconfirmed_count}
            required
          />
        </label>
        <label className="record-checkbox">
          <input
            name="needsAssistance"
            type="checkbox"
            defaultChecked={session.family.needs_assistance}
          />
          <span>Needs assistance</span>
        </label>
        <label className="record-field">
          <span>Notes</span>
          <textarea name="notes" defaultValue={session.family.notes ?? ''} />
        </label>
        <button type="submit" disabled={isFamilySubmitting}>
          Save family status
        </button>
        {residentError ? <p className="error-state">{residentError}</p> : null}
        {familyError ? <p className="error-state">{familyError.message}</p> : null}
      </form>

      <form className="record-form" onSubmit={onHouseSubmit}>
        <div>
          <p className="eyebrow">Report</p>
          <h2>Household condition</h2>
        </div>
        <label className="record-field">
          <span>Current status</span>
          <select name="currentStatus" defaultValue={session.house.current_status} required>
            {Constants.public.Enums.house_status.map(status => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="record-field">
          <span>Water level</span>
          <select name="waterLevel" defaultValue={session.house.water_level} required>
            {Constants.public.Enums.water_level.map(level => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={isHouseSubmitting}>
          Submit report
        </button>
        {houseError ? <p className="error-state">{houseError.message}</p> : null}
        {feedback ? <p className="success-state">{feedback}</p> : null}
      </form>
    </section>
  );
}

function readFormString(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim();
}

function normalizeResidentFamilyCode(value: string) {
  return value.trim().toUpperCase();
}

function parseResidentQrAccessCode(value: string) {
  const rawValue = value.trim();

  if (!rawValue) return '';

  const jsonCode = parseResidentQrJsonCode(rawValue);
  if (jsonCode) return normalizeResidentFamilyCode(jsonCode);

  const urlCode = parseResidentQrUrlCode(rawValue);
  if (urlCode) return normalizeResidentFamilyCode(urlCode);

  return normalizeResidentFamilyCode(rawValue);
}

function parseResidentQrJsonCode(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== 'object') return '';

    const record = parsed as Record<string, unknown>;
    const code = record.familyCode ?? record.family_code ?? record.code;

    return typeof code === 'string' ? code : '';
  } catch {
    return '';
  }
}

function parseResidentQrUrlCode(value: string) {
  try {
    const url = new URL(value);
    const queryCode =
      url.searchParams.get('familyCode') ??
      url.searchParams.get('family_code') ??
      url.searchParams.get('code');

    if (queryCode) return queryCode;

    const hashParams = new URLSearchParams(url.hash.replace(/^#\/?\??/, ''));
    const hashCode =
      hashParams.get('familyCode') ?? hashParams.get('family_code') ?? hashParams.get('code');

    if (hashCode) return hashCode;

    return decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) ?? '');
  } catch {
    return '';
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function readFormNumber(form: FormData, key: string) {
  const value = Number(form.get(key) ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function formatResidentFlags(resident: ResidentSessionData['residents'][number]) {
  const flags = [
    resident.is_child ? 'Child' : null,
    resident.is_senior ? 'Senior' : null,
    resident.is_pwd ? 'PWD' : null,
    resident.is_pregnant ? 'Pregnant' : null,
  ].filter(Boolean);

  return flags.length ? flags.join(', ') : 'None';
}

function formatCenterSupplies(center: ResidentSessionData['evacuationCenters'][number]) {
  const supplies = [
    center.has_food_supply ? 'Food' : null,
    center.has_water_supply ? 'Water' : null,
    center.has_medical_support ? 'Medical' : null,
    center.has_power ? 'Power' : null,
  ].filter(Boolean);

  return supplies.length ? supplies.join(', ') : 'No supplies tagged';
}
