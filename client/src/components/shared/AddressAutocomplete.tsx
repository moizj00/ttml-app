import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: {
      maps: {
        places: {
          AutocompleteService: new () => GoogleAutocompleteService;
          PlacesService: new (el: HTMLElement) => GooglePlacesService;
          PlacesServiceStatus: { OK: string; ZERO_RESULTS: string; [key: string]: string };
        };
      };
    };
  }
}

interface GoogleAutocompletePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface GoogleAutocompleteService {
  getPlacePredictions: (
    request: { input: string; types?: string[]; componentRestrictions?: { country: string } },
    callback: (results: GoogleAutocompletePrediction[] | null, status: string) => void,
  ) => void;
}

interface GooglePlacesService {
  getDetails: (
    request: { placeId: string; fields: string[] },
    callback: (place: { formatted_address?: string } | null, status: string) => void,
  ) => void;
}

const BUILD_TIME_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let googleMapsPromise: Promise<void> | null = null;

async function resolveApiKey(): Promise<string> {
  if (BUILD_TIME_API_KEY) return BUILD_TIME_API_KEY;
  try {
    const res = await fetch("/api/config/maps-key");
    if (!res.ok) throw new Error("No key");
    const data = await res.json();
    return data.key as string;
  } catch {
    return "";
  }
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (googleMapsPromise) return googleMapsPromise;

  if (window.google?.maps?.places) {
    googleMapsPromise = Promise.resolve();
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googleMapsPromise = null;
      reject(new Error("Failed to load Google Maps"));
    };
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

interface Prediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface AddressAutocompleteProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

export function AddressAutocomplete({
  id,
  value,
  onChange,
  placeholder = "Start typing an address...",
  className,
  "data-testid": dataTestId,
}: AddressAutocompleteProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteService = useRef<GoogleAutocompleteService | null>(null);
  const placesService = useRef<GooglePlacesService | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const skipNextSearch = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const apiKey = await resolveApiKey();
        if (!apiKey) {
          if (!cancelled) setMapsError(true);
          return;
        }
        await loadGoogleMapsScript(apiKey);
        if (cancelled) return;
        const g = window.google!;
        autocompleteService.current = new g.maps.places.AutocompleteService();
        const dummyDiv = document.createElement("div");
        placesService.current = new g.maps.places.PlacesService(dummyDiv);
        setMapsReady(true);
      } catch {
        if (!cancelled) setMapsError(true);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchPlaces = useCallback(
    (input: string) => {
      if (!autocompleteService.current || input.length < 3) {
        setPredictions([]);
        setShowDropdown(false);
        return;
      }

      setIsLoading(true);
      autocompleteService.current.getPlacePredictions(
        {
          input,
          types: ["address"],
          componentRestrictions: { country: "us" },
        },
        (results: GoogleAutocompletePrediction[] | null, status: string) => {
          setIsLoading(false);
          const PlacesStatus = window.google?.maps?.places?.PlacesServiceStatus;
          if (PlacesStatus && status === PlacesStatus.OK && results) {
            setPredictions(
              results.slice(0, 5).map((r: GoogleAutocompletePrediction) => ({
                placeId: r.place_id,
                description: r.description,
                mainText: r.structured_formatting.main_text,
                secondaryText: r.structured_formatting.secondary_text,
              }))
            );
            setShowDropdown(true);
            setActiveIndex(-1);
          } else {
            setPredictions([]);
            setShowDropdown(false);
            if (
              PlacesStatus &&
              status !== PlacesStatus.ZERO_RESULTS &&
              status !== PlacesStatus.OK
            ) {
              setMapsError(true);
            }
          }
        }
      );
    },
    []
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (mapsReady) searchPlaces(val);
    }, 300);
  };

  const selectPrediction = (prediction: Prediction) => {
    if (!placesService.current) {
      skipNextSearch.current = true;
      onChange(prediction.description);
      setPredictions([]);
      setShowDropdown(false);
      setActiveIndex(-1);
      return;
    }

    placesService.current.getDetails(
      {
        placeId: prediction.placeId,
        fields: ["formatted_address"],
      },
      (place: { formatted_address?: string } | null, status: string) => {
        const formatted =
          status === window.google!.maps.places.PlacesServiceStatus.OK && place?.formatted_address
            ? place.formatted_address
            : prediction.description;

        skipNextSearch.current = true;
        onChange(formatted);
        setPredictions([]);
        setShowDropdown(false);
        setActiveIndex(-1);
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || predictions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < predictions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : predictions.length - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectPrediction(predictions[activeIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          name={id}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (predictions.length > 0) setShowDropdown(true);
          }}
          placeholder={placeholder}
          className={cn("pr-8", className)}
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
          aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          data-testid={dataTestId}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <MapPin className="w-3.5 h-3.5" />
          )}
        </div>
      </div>

      {mapsError && (
        <p className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground" data-testid={`${id}-maps-error`}>
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          Address suggestions unavailable — please type your full address manually.
        </p>
      )}

      {showDropdown && predictions.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
          data-testid={`${id}-suggestions`}
        >
          {predictions.map((p, i) => (
            <li
              key={p.placeId}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={cn(
                "flex items-start gap-2.5 px-3 py-2.5 cursor-pointer text-sm transition-colors",
                i === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                selectPrediction(p);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              data-testid={`${id}-suggestion-${i}`}
            >
              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-medium truncate">{p.mainText}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {p.secondaryText}
                </p>
              </div>
            </li>
          ))}
          <li className="px-3 py-1.5 text-[10px] text-muted-foreground text-right border-t border-border">
            Powered by Google
          </li>
        </ul>
      )}
    </div>
  );
}
